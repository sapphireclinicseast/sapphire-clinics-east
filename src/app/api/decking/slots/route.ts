import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const staffId   = searchParams.get('staffId')
  const branch    = searchParams.get('branch')
  const dayOfWeek = searchParams.get('dayOfWeek')

  const slots = await prisma.deckingSlot.findMany({
    where: {
      ...(staffId   ? { staffId }   : {}),
      ...(branch    ? { branch }    : {}),
      ...(dayOfWeek ? { dayOfWeek } : {}),
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  })
  return NextResponse.json(slots)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffId, patientId, dayOfWeek, startTime, endTime, branch, department, notes } = await req.json()
  if (!staffId || !dayOfWeek || !startTime || !endTime)
    return NextResponse.json({ error: 'staffId, dayOfWeek, startTime, endTime are required' }, { status: 400 })

  // Enforce max 3 patients per time slot
  const existing = await prisma.deckingSlot.count({ where: { staffId, dayOfWeek, startTime } })
  if (existing >= 3)
    return NextResponse.json({ error: 'Maximum 3 patients per time slot' }, { status: 400 })

  const slot = await prisma.deckingSlot.create({
    data: {
      staffId, dayOfWeek, startTime, endTime, branch, department,
      patientId: patientId || null,
      notes: notes || null,
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  })
  return NextResponse.json(slot)
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  await prisma.deckingSlot.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
