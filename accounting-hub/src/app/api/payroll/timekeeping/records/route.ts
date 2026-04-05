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
