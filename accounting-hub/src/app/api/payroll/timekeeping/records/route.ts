import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (employeeId) where.employeeId = employeeId
  if (branch) where.employee = { branch }
  if (startDate || endDate) {
    where.date = {}
    if (startDate) where.date.gte = new Date(startDate)
    if (endDate) where.date.lte = new Date(endDate)
  }

  const records = await prisma.timekeepingRecord.findMany({
    where,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, department: true, branch: true, scheduleIn: true, scheduleOut: true } },
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
  const { id, timeIn, timeOut, lateMinutes, undertimeMinutes, overtimeMinutes, remarks } = body

  if (!id) {
    return NextResponse.json({ error: 'Missing record id' }, { status: 400 })
  }

  const existing = await prisma.timekeepingRecord.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  // Recalculate hours worked if times changed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { source: 'MANUAL' }
  if (timeIn !== undefined) data.timeIn = timeIn ? new Date(timeIn) : null
  if (timeOut !== undefined) data.timeOut = timeOut ? new Date(timeOut) : null
  if (remarks !== undefined) data.remarks = remarks || null
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
