import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'VIEWER']
const DAYS_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

function allowedBranches(role: string): string[] | null {
  if (role === 'SBEA_ADMIN') return ['SBEA', 'VERDANA']
  if (role === 'SBGH_ADMIN') return ['SBGH', 'VERDANA']
  if (role === 'VERDANA_ADMIN') return ['VERDANA']
  return null
}

function fmtTimePH(dt: Date | null | undefined): string | null {
  if (!dt) return null
  const d = new Date(dt)
  const totalMin = (d.getUTCHours() * 60 + d.getUTCMinutes() + 8 * 60) % (24 * 60)
  const h = Math.floor(totalMin / 60), m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'dateFrom and dateTo are required' }, { status: 400 })
  }

  const qBranch = branch === 'SANDBOX_EAST' ? 'SBEA' : branch === 'SANDBOX_GREENHILLS' ? 'SBGH' : branch

  const allowed = allowedBranches(session.user.role as string)
  if (qBranch && allowed && !allowed.includes(qBranch)) {
    return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
  }

  // Grace period from settings
  let settings = await prisma.employeeSettings.findFirst()
  if (!settings) settings = await prisma.employeeSettings.create({ data: {} })
  const lateGrace = Number(settings.lateGraceMinutes) || 0

  const startDate = new Date(dateFrom + 'T00:00:00Z')
  const endDate = new Date(dateTo + 'T00:00:00Z')
  endDate.setDate(endDate.getDate() + 1) // inclusive end date

  // Employee filter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const empWhere: any = { isActive: true }
  if (qBranch) empWhere.branch = qBranch
  else if (allowed) empWhere.branch = { in: allowed }

  const employees = await prisma.employee.findMany({
    where: empWhere,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  // Timekeeping records in range that have a timeIn
  const records = await prisma.timekeepingRecord.findMany({
    where: {
      date: { gte: startDate, lt: endDate },
      employee: empWhere,
      timeIn: { not: null },
    },
    orderBy: { date: 'asc' },
  })

  // Group records by employeeId
  const recByEmp = new Map<string, typeof records>()
  for (const r of records) {
    if (!recByEmp.has(r.employeeId)) recByEmp.set(r.employeeId, [])
    recByEmp.get(r.employeeId)!.push(r)
  }

  const result = []

  for (const emp of employees) {
    const empRecords = recByEmp.get(emp.id) || []
    const empDaySchedules = emp.daySchedules as Record<string, { in: string; out: string }> | null

    const lates = []

    for (const rec of empRecords) {
      if (!rec.timeIn) continue

      const dayName = DAYS_NAMES[rec.date.getUTCDay()]
      const holidayKey = rec.isHoliday
        ? (rec.holidayType === 'REGULAR' ? 'REGULAR_HOLIDAY' : 'SPECIAL_HOLIDAY')
        : null
      const daySched = (holidayKey ? empDaySchedules?.[holidayKey] : null) ?? empDaySchedules?.[dayName] ?? null
      const scheduledIn = daySched?.in || emp.scheduleIn

      const phtIn = new Date(rec.timeIn.getTime() + 8 * 60 * 60 * 1000)
      const [schInH, schInM] = scheduledIn.split(':').map(Number)
      const actualInMin = phtIn.getUTCHours() * 60 + phtIn.getUTCMinutes()
      const scheduledInMin = schInH * 60 + schInM
      const lateMinutes = Math.max(0, actualInMin - scheduledInMin)

      if (lateMinutes <= 0) continue // on time

      const withinGrace = lateMinutes <= lateGrace
      const effectiveLate = Math.max(0, lateMinutes - lateGrace)

      lates.push({
        date: rec.date.toISOString().substring(0, 10),
        dayOfWeek: dayName,
        timeIn: fmtTimePH(rec.timeIn),
        scheduledIn,
        lateMinutes,
        withinGrace,
        effectiveLate,
      })
    }

    if (lates.length === 0) continue // no lates for this employee

    result.push({
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      department: emp.department,
      branch: emp.branch,
      lateCount: lates.length,
      withinGraceCount: lates.filter(l => l.withinGrace).length,
      beyondGraceCount: lates.filter(l => !l.withinGrace).length,
      totalLateMinutes: lates.reduce((s, l) => s + l.lateMinutes, 0),
      lates,
    })
  }

  // Sort by late count descending (most lates first)
  result.sort((a, b) => b.lateCount - a.lateCount)

  return NextResponse.json({ lateGrace, employees: result })
}
