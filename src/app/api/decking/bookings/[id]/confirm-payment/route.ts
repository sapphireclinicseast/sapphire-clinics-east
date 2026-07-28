// POST /api/decking/bookings/[id]/confirm-payment
//
// Front-desk action: manually confirm that a PENDING teletherapy booking has
// been paid. Since teletherapy uses the accounting-hub's PayMongo links
// (not ours), the ops hub never receives a webhook. The front desk verifies
// payment in the accounting-hub, then clicks this to advance the booking to
// PAID so the "Add to Staff Deck" and "Recorded DP" actions become available.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = new Set([
  'ADMIN', 'MARKETING_ADMIN',
  'AHEA_ADMIN', 'AHGH_ADMIN',
  'AHEA_FRONT_DESK', 'AHGH_FRONT_DESK',
])

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
    select: { id: true, status: true },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status !== 'PENDING') {
    return NextResponse.json(
      { error: `Booking is already ${booking.status} — nothing to confirm.` },
      { status: 409 },
    )
  }

  await prisma.patientBooking.update({
    where: { id },
    data: { status: 'PAID', paidAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
