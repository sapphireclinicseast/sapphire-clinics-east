import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

  const startDate = new Date(Date.UTC(year, 0, 1))
  const endDate = new Date(Date.UTC(year + 1, 0, 1))

  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: startDate, lt: endDate } },
    orderBy: { date: 'asc' },
  })

  return NextResponse.json(holidays)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, date, holidayType, branch, isRecurring } = body

  if (!name || !date || !holidayType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const holiday = await prisma.holiday.create({
    data: {
      name,
      date: new Date(date),
      holidayType,
      branch: branch || null,
      isRecurring: isRecurring || false,
    },
  })

  return NextResponse.json(holiday)
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, ...data } = body

  if (!id) {
    return NextResponse.json({ error: 'Missing holiday id' }, { status: 400 })
  }

  const holiday = await prisma.holiday.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.date !== undefined && { date: new Date(data.date) }),
      ...(data.holidayType !== undefined && { holidayType: data.holidayType }),
      ...(data.branch !== undefined && { branch: data.branch || null }),
      ...(data.isRecurring !== undefined && { isRecurring: data.isRecurring }),
    },
  })

  return NextResponse.json(holiday)
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Missing holiday id' }, { status: 400 })
  }

  await prisma.holiday.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
