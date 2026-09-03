import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PAYMENT_TYPES = ['CASH', 'HMO', 'GL'] as const

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

  const { staffId, patientId, dayOfWeek, startTime, endTime, branch, department, notes, disabled, paymentType, isClass } = await req.json()
  if (!staffId || !dayOfWeek || !startTime || !endTime)
    return NextResponse.json({ error: 'staffId, dayOfWeek, startTime, endTime are required' }, { status: 400 })

  const isDisabled = disabled === true

  if (isDisabled) {
    // Only one disabled marker per staff/day/time cell
    const alreadyDisabled = await prisma.deckingSlot.findFirst({
      where: { staffId, dayOfWeek, startTime, disabled: true },
    })
    if (alreadyDisabled) {
      return NextResponse.json({ error: 'Slot is already disabled' }, { status: 400 })
    }
  } else {
    // Max 3 patients per time slot — a therapist runs one-to-one or a small
    // pair, so a fourth name in an hour is a mistake worth blocking.
    //
    // Class bookings are exempt: a class is many children by definition, and
    // capping it at 3 would cap the class size. Keyed off isClass rather than
    // department, because a 1-on-1 SPED session is still 1-on-1 and keeps the
    // cap — exempting the whole department also exempted those.
    if (!isClass) {
      const existing = await prisma.deckingSlot.count({
        where: { staffId, dayOfWeek, startTime, disabled: false, isClass: false },
      })
      if (existing >= 3)
        return NextResponse.json({ error: 'Maximum 3 patients per time slot' }, { status: 400 })
    }
  }

  const slot = await prisma.deckingSlot.create({
    data: {
      staffId, dayOfWeek, startTime, endTime, branch, department,
      patientId: isDisabled ? null : (patientId || null),
      notes: notes || null,
      // Whitelisted rather than passed through: this drives the board's colour
      // coding, and an unrecognised value would render as an uncoloured cell
      // that looks like plain cash.
      paymentType: PAYMENT_TYPES.includes(paymentType) ? paymentType : 'CASH',
      isClass: isClass === true,
      disabled: isDisabled,
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  })
  return NextResponse.json(slot)
}

// PATCH — change an existing slot's payment type. Front desk usually learns
// whether a session is HMO or GL after the patient is already decked, so this
// has to be editable in place rather than only at creation.
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, paymentType } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (!PAYMENT_TYPES.includes(paymentType)) {
    return NextResponse.json({ error: `paymentType must be one of ${PAYMENT_TYPES.join(', ')}` }, { status: 400 })
  }

  const slot = await prisma.deckingSlot.update({
    where: { id },
    data: { paymentType },
    include: { patient: { select: { id: true, firstName: true, lastName: true } } },
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
