import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

// Parse .dat biometric file
// Format: tab-delimited, columns: employeeBioId, date+time, flag, 0=in/1=out, rest ignored
function parseDatFile(content: string): { bioId: number; timestamp: Date; isOut: boolean }[] {
  const lines = content.split('\n').filter(l => l.trim())
  const records: { bioId: number; timestamp: Date; isOut: boolean }[] = []

  for (const line of lines) {
    const cols = line.split('\t')
    if (cols.length < 4) continue

    const bioId = parseInt(cols[0].trim())
    const dateTimeStr = cols[1].trim()
    const isOut = cols[3].trim() === '1'

    if (isNaN(bioId)) continue

    // Parse date: "M/D/YYYY H:mm" or "MM/DD/YYYY HH:mm"
    const ts = new Date(dateTimeStr)
    if (isNaN(ts.getTime())) continue

    records.push({ bioId, timestamp: ts, isOut })
  }

  return records
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { fileName, content, branch } = body

  if (!content) {
    return NextResponse.json({ error: 'No file content provided' }, { status: 400 })
  }

  const raw = parseDatFile(content)
  if (raw.length === 0) {
    return NextResponse.json({ error: 'No valid records found in file' }, { status: 400 })
  }

  // Create upload record
  const upload = await prisma.timekeepingUpload.create({
    data: {
      fileName: fileName || 'upload.dat',
      branch: branch || null,
      uploadedById: session.user.id as string,
      recordCount: raw.length,
    },
  })

  // Get all employees with biometric IDs
  const employees = await prisma.employee.findMany({
    where: { employeeBioId: { not: null } },
    select: { id: true, employeeBioId: true, scheduleIn: true, scheduleOut: true, restDay: true },
  })
  const bioMap = new Map(employees.map(e => [e.employeeBioId!, e]))

  // Get holidays in the date range for marking
  const dates = raw.map(r => {
    const d = new Date(r.timestamp)
    d.setHours(0, 0, 0, 0)
    return d
  })
  const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
  maxDate.setDate(maxDate.getDate() + 1)

  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: minDate, lt: maxDate } },
  })
  const holidayMap = new Map(holidays.map(h => [h.date.toISOString().split('T')[0], h]))

  // Group raw records by employee + date
  const grouped = new Map<string, { bioId: number; date: string; ins: Date[]; outs: Date[] }>()
  for (const r of raw) {
    const emp = bioMap.get(r.bioId)
    if (!emp) continue

    const dateKey = r.timestamp.toISOString().split('T')[0]
    const key = `${emp.id}|${dateKey}`

    if (!grouped.has(key)) {
      grouped.set(key, { bioId: r.bioId, date: dateKey, ins: [], outs: [] })
    }
    const g = grouped.get(key)!
    if (r.isOut) g.outs.push(r.timestamp)
    else g.ins.push(r.timestamp)
  }

  // Days of week for rest day comparison
  const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

  let created = 0
  let updated = 0

  for (const [key, g] of grouped) {
    const [employeeId] = key.split('|')
    const emp = employees.find(e => e.employeeBioId === g.bioId)
    if (!emp) continue

    // First in, last out
    const timeIn = g.ins.length > 0 ? new Date(Math.min(...g.ins.map(d => d.getTime()))) : null
    const timeOut = g.outs.length > 0 ? new Date(Math.max(...g.outs.map(d => d.getTime()))) : null

    const dateObj = new Date(g.date + 'T00:00:00Z')
    const dayOfWeek = DAYS[dateObj.getUTCDay()]
    const restDays = (emp.restDay || '').split(',').map(d => d.trim())
    const isRestDay = restDays.includes(dayOfWeek)

    const holiday = holidayMap.get(g.date)
    const isHoliday = !!holiday
    const holidayType = holiday?.holidayType || null

    // Compute hours worked, late minutes, undertime
    let hoursWorked = 0
    let lateMinutes = 0
    let undertimeMinutes = 0
    let overtimeMinutes = 0

    if (timeIn && timeOut) {
      hoursWorked = (timeOut.getTime() - timeIn.getTime()) / (1000 * 60 * 60)
      // Subtract 1 hour for lunch if worked more than 5 hours
      if (hoursWorked > 5) hoursWorked -= 1

      // Parse schedule
      const [schInH, schInM] = emp.scheduleIn.split(':').map(Number)
      const [schOutH, schOutM] = emp.scheduleOut.split(':').map(Number)

      // Late: compare actual timeIn with schedule
      const schedInMinutes = schInH * 60 + schInM
      const actualInMinutes = timeIn.getHours() * 60 + timeIn.getMinutes()
      if (actualInMinutes > schedInMinutes) {
        lateMinutes = actualInMinutes - schedInMinutes
      }

      // Undertime: compare actual timeOut with schedule
      const schedOutMinutes = schOutH * 60 + schOutM
      const actualOutMinutes = timeOut.getHours() * 60 + timeOut.getMinutes()
      if (actualOutMinutes < schedOutMinutes) {
        undertimeMinutes = schedOutMinutes - actualOutMinutes
      }

      // Overtime: if worked beyond scheduled hours (8 standard)
      const standardHours = 8
      if (hoursWorked > standardHours) {
        overtimeMinutes = Math.round((hoursWorked - standardHours) * 60)
      }
    }

    try {
      await prisma.timekeepingRecord.upsert({
        where: { employeeId_date: { employeeId, date: dateObj } },
        update: {
          timeIn,
          timeOut,
          hoursWorked: Math.max(0, hoursWorked),
          lateMinutes,
          undertimeMinutes,
          overtimeMinutes,
          isRestDay,
          isHoliday,
          holidayType,
          uploadId: upload.id,
          source: 'BIOMETRIC',
        },
        create: {
          employeeId,
          date: dateObj,
          timeIn,
          timeOut,
          hoursWorked: Math.max(0, hoursWorked),
          lateMinutes,
          undertimeMinutes,
          overtimeMinutes,
          isRestDay,
          isHoliday,
          holidayType,
          uploadId: upload.id,
          source: 'BIOMETRIC',
        },
      })
      if (g.ins.length > 0 || g.outs.length > 0) created++
    } catch {
      updated++
    }
  }

  return NextResponse.json({
    uploadId: upload.id,
    totalRawRecords: raw.length,
    uniqueBioIds: new Set(raw.map(r => r.bioId)).size,
    recordsProcessed: created + updated,
    unmatchedBioIds: [...new Set(raw.map(r => r.bioId))].filter(id => !bioMap.has(id)),
  })
}
