import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const staffId   = searchParams.get('staffId')
  const date      = searchParams.get('date')       // YYYY-MM-DD (single day)
  const startDate = searchParams.get('startDate') // YYYY-MM-DD (range start)
  const endDate   = searchParams.get('endDate')   // YYYY-MM-DD (range end)

  let dayStart: Date, dayEnd: Date
  if (startDate && endDate) {
    dayStart = new Date(`${startDate}T00:00:00.000Z`)
    dayEnd   = new Date(`${endDate}T23:59:59.999Z`)
  } else if (date) {
    dayStart = new Date(`${date}T00:00:00.000Z`)
    dayEnd   = new Date(`${date}T23:59:59.999Z`)
  } else {
    return NextResponse.json({ error: 'date or startDate+endDate is required' }, { status: 400 })
  }

  const schedules = await prisma.schedule.findMany({
    where: {
      ...(staffId ? { staffId } : {}),
      date: { gte: dayStart, lte: dayEnd },
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      staff: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
    },
    orderBy: { startTime: 'asc' },
  })

  return NextResponse.json(schedules)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffId, patientId, date, startTime, endTime, duration, sessionType, status, notes } = await req.json()

  if (!staffId || !date || !startTime || !endTime || !duration || !sessionType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const schedule = await prisma.schedule.create({
    data: {
      staffId,
      patientId: patientId || null,
      date: new Date(`${date}T00:00:00.000Z`),
      startTime,
      endTime,
      duration,
      sessionType,
      status: status || 'PENDING',
      notes: notes || null,
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
    },
  })

  return NextResponse.json(schedule, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, patientId, date, startTime, endTime, duration, sessionType, status, notes } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (patientId !== undefined) data.patientId = patientId || null
  if (date !== undefined) data.date = new Date(`${date}T00:00:00.000Z`)
  if (startTime !== undefined) data.startTime = startTime
  if (endTime !== undefined) data.endTime = endTime
  if (duration !== undefined) data.duration = duration
  if (sessionType !== undefined) data.sessionType = sessionType
  if (status !== undefined) data.status = status
  if (notes !== undefined) data.notes = notes || null

  const schedule = await prisma.schedule.update({
    where: { id },
    data,
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
    },
  })

  return NextResponse.json(schedule)
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  await prisma.schedule.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
