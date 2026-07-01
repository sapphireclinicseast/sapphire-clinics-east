import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const READ_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

function allowedBranches(role: string): string[] | null {
  if (role === 'SBEA_ADMIN') return ['SBEA', 'VERDANA']
  if (role === 'SBGH_ADMIN') return ['SBGH', 'VERDANA']
  if (role === 'VERDANA_ADMIN') return ['VERDANA']
  return null
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const employeeId = searchParams.get('employeeId') || ''
  const branch = searchParams.get('branch') || ''
  const startDate = searchParams.get('startDate') || ''
  const endDate = searchParams.get('endDate') || ''
  const minStatus = searchParams.get('minStatus') || '' // ACCEPTED or FINALIZED — filter by upload status

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (employeeId) where.employeeId = employeeId

  // Filter by upload status: only show records from uploads with at least this status
  // Manual records (no upload) are always included
  if (minStatus === 'ACCEPTED') {
    where.OR = [
      { uploadId: null }, // manual entries always visible
      { upload: { status: { in: ['ACCEPTED', 'FINALIZED'] } } },
    ]
  } else if (minStatus === 'FINALIZED') {
    where.OR = [
      { uploadId: null },
      { upload: { status: 'FINALIZED' } },
    ]
  }

  // Enforce branch restriction based on role
  const allowed = allowedBranches(session.user.role as string)
  if (branch) {
    if (allowed && !allowed.includes(branch)) {
      return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
    }
    where.employee = { branch }
  } else if (allowed) {
    where.employee = { branch: { in: allowed } }
  }

  if (startDate || endDate) {
    where.date = {}
    if (startDate) where.date.gte = new Date(startDate)
    if (endDate) where.date.lte = new Date(endDate)
  }

  const records = await prisma.timekeepingRecord.findMany({
    where,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, department: true, branch: true, scheduleIn: true, scheduleOut: true } },
      upload: { select: { id: true, status: true } },
    },
    orderBy: [{ date: 'asc' }],
  })

  return NextResponse.json(records)
}

// Manual timekeeping entry
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { employeeId, date, timeIn, timeOut, remarks } = body

  if (!employeeId || !date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const dateObj = new Date(date + 'T00:00:00Z')

  const record = await prisma.timekeepingRecord.upsert({
    where: { employeeId_date: { employeeId, date: dateObj } },
    update: {
      timeIn: timeIn ? new Date(timeIn) : null,
      timeOut: timeOut ? new Date(timeOut) : null,
      remarks: remarks || null,
      source: 'MANUAL',
    },
    create: {
      employeeId,
      date: dateObj,
      timeIn: timeIn ? new Date(timeIn) : null,
      timeOut: timeOut ? new Date(timeOut) : null,
      remarks: remarks || null,
      source: 'MANUAL',
    },
  })

  return NextResponse.json(record)
}

// Edit existing timekeeping record
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, timeIn, timeOut, lateMinutes, undertimeMinutes, overtimeMinutes, remarks, resolveConflict, dtrProof } = body

  if (!id) {
    return NextResponse.json({ error: 'Missing record id' }, { status: 400 })
  }

  const existing = await prisma.timekeepingRecord.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  // Recalculate hours worked if times changed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {}

  // If resolving a conflict, change source from BIOMETRIC_CONFLICT back to BIOMETRIC
  // and clear the conflict data
  if (resolveConflict) {
    data.source = 'BIOMETRIC'
    data.conflictData = Prisma.JsonNull
  } else {
    data.source = 'MANUAL'
  }

  if (timeIn !== undefined) data.timeIn = timeIn ? new Date(timeIn) : null
  if (timeOut !== undefined) data.timeOut = timeOut ? new Date(timeOut) : null
  if (remarks !== undefined) data.remarks = remarks || null
  if (dtrProof !== undefined) data.dtrProof = dtrProof || null
  if (lateMinutes !== undefined) data.lateMinutes = parseInt(lateMinutes) || 0
  if (undertimeMinutes !== undefined) data.undertimeMinutes = parseInt(undertimeMinutes) || 0
  if (overtimeMinutes !== undefined) data.overtimeMinutes = parseInt(overtimeMinutes) || 0

  // Recalculate hours if both times are provided
  const newIn = data.timeIn !== undefined ? data.timeIn : existing.timeIn
  const newOut = data.timeOut !== undefined ? data.timeOut : existing.timeOut
  if (newIn && newOut) {
    let hours = (new Date(newOut).getTime() - new Date(newIn).getTime()) / (1000 * 60 * 60)
    if (hours > 5) hours -= 1 // lunch break
    data.hoursWorked = Math.max(0, hours)
  }

  // Recalculate late/undertime if times changed and we have an employee schedule
  if ((timeIn !== undefined || timeOut !== undefined) && (resolveConflict || data.source === 'MANUAL')) {
    const empRecord = await prisma.timekeepingRecord.findUnique({
      where: { id },
      include: { employee: { select: { scheduleIn: true, scheduleOut: true, daySchedules: true } } },
    })
    if (empRecord?.employee && newIn && newOut) {
      // Check for per-day schedule override
      const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
      const dayOfWeek = DAYS[existing.date.getUTCDay()]
      const ds = empRecord.employee.daySchedules as Record<string, { in: string; out: string }> | null
      const daySched = ds?.[dayOfWeek]
      const schedIn = daySched?.in || empRecord.employee.scheduleIn
      const schedOut = daySched?.out || empRecord.employee.scheduleOut
      const [schInH, schInM] = schedIn.split(':').map(Number)
      const [schOutH, schOutM] = schedOut.split(':').map(Number)
      const phtIn = new Date(new Date(newIn).getTime() + 8 * 60 * 60 * 1000)
      const phtOut = new Date(new Date(newOut).getTime() + 8 * 60 * 60 * 1000)
      const schedInMinutes = schInH * 60 + schInM
      const actualInMinutes = phtIn.getUTCHours() * 60 + phtIn.getUTCMinutes()
      if (actualInMinutes > schedInMinutes) data.lateMinutes = actualInMinutes - schedInMinutes
      else data.lateMinutes = 0
      const schedOutMinutes = schOutH * 60 + schOutM
      const actualOutMinutes = phtOut.getUTCHours() * 60 + phtOut.getUTCMinutes()
      if (actualOutMinutes < schedOutMinutes) data.undertimeMinutes = schedOutMinutes - actualOutMinutes
      else data.undertimeMinutes = 0
      const hours = data.hoursWorked || 0
      if (hours > 8) data.overtimeMinutes = Math.round((hours - 8) * 60)
      else data.overtimeMinutes = 0
    }
  }

  const record = await prisma.timekeepingRecord.update({ where: { id }, data })
  return NextResponse.json(record)
}

// Delete timekeeping record(s)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const uploadId = searchParams.get('uploadId')

  if (id) {
    await prisma.timekeepingRecord.delete({ where: { id } })
    return NextResponse.json({ deleted: 1 })
  }

  if (uploadId) {
    const result = await prisma.timekeepingRecord.deleteMany({ where: { uploadId } })
    await prisma.timekeepingUpload.delete({ where: { id: uploadId } }).catch(() => {})
    return NextResponse.json({ deleted: result.count })
  }

  return NextResponse.json({ error: 'Provide id or uploadId' }, { status: 400 })
}
