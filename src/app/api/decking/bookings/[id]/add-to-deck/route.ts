// POST /api/decking/bookings/[id]/add-to-deck
//
// Front-desk action: take a PAID PatientBooking and materialize it as a
// recurring entry in the Decking Module — i.e. create a DeckingSlot for
// the booking's (staffId, dayOfWeek, startTime, endTime, branch, dept)
// cell with patientId attached. After this runs the patient appears in
// the therapist's weekly grid like any other admin-assigned slot.
//
// Idempotent: if the cell already contains this patient, the booking is
// just flagged addedToDeck and we return without creating a duplicate.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = new Set([
  'ADMIN', 'MARKETING_ADMIN',
  'AHEA_ADMIN', 'AHGH_ADMIN',
  'AHEA_FRONT_DESK', 'AHGH_FRONT_DESK',
])

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
const MAX_PATIENTS_PER_CELL = 3

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: 'Front-desk access required' }, { status: 403 })
  }

  const { id } = await params

  const booking = await prisma.patientBooking.findUnique({
    where: { id },
    select: {
      id: true, status: true, addedToDeck: true,
      staffId: true, patientId: true, branch: true, department: true,
      date: true, startTime: true, endTime: true,
    },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status !== 'PAID' && booking.status !== 'COMPLETED') {
    return NextResponse.json(
      { error: `Booking is ${booking.status}; only PAID bookings can be added to the deck.` },
      { status: 409 },
    )
  }

  // Compute the dayOfWeek the slot maps to in the recurring grid.
  const dow = DAY_NAMES[booking.date.getUTCDay()]

  // Idempotency: does a slot for this (staff, day, time) already include
  // this patient?
  const existing = await prisma.deckingSlot.findFirst({
    where: {
      staffId: booking.staffId,
      dayOfWeek: dow,
      startTime: booking.startTime,
      patientId: booking.patientId,
    },
    select: { id: true },
  })
  if (existing) {
    await prisma.patientBooking.update({ where: { id }, data: { addedToDeck: true } })
    return NextResponse.json({
      ok: true,
      slotId: existing.id,
      reused: true,
      message: 'Patient was already on this cell — flag set, no new slot created.',
    })
  }

  // Capacity check: max 3 patients per cell (matches /api/decking/slots).
  const occupants = await prisma.deckingSlot.count({
    where: {
      staffId: booking.staffId,
      dayOfWeek: dow,
      startTime: booking.startTime,
      patientId: { not: null },
    },
  })
  if (occupants >= MAX_PATIENTS_PER_CELL) {
    return NextResponse.json(
      { error: `That cell already has ${MAX_PATIENTS_PER_CELL} patients — can't add another. Move someone first.` },
      { status: 409 },
    )
  }

  const slot = await prisma.deckingSlot.create({
    data: {
      staffId: booking.staffId,
      patientId: booking.patientId,
      dayOfWeek: dow,
      startTime: booking.startTime,
      endTime: booking.endTime,
      branch: booking.branch,
      department: booking.department,
      notes: `Auto-added from portal booking ${booking.id}`,
    },
    select: { id: true },
  })

  await prisma.patientBooking.update({
    where: { id },
    data: { addedToDeck: true, deckingSlotId: slot.id },
  })

  return NextResponse.json({ ok: true, slotId: slot.id })
}
