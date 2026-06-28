// POST /api/decking/bookings/[id]/recorded-in-accounting
//
// Front-desk action: flag that the patient's downpayment for this booking
// has been logged inside accounting-hub. This is a one-click ledger marker
// — it doesn't push anything to the accounting DB; it just records on our
// side that the bookkeeping was done so the row doesn't keep nagging.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = new Set([
  'ADMIN', 'MARKETING_ADMIN',
  'SBEA_ADMIN', 'SBGH_ADMIN',
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
  if (booking.status !== 'PAID' && booking.status !== 'COMPLETED') {
    return NextResponse.json(
      { error: `Booking is ${booking.status}; only PAID bookings can be marked accounted.` },
      { status: 409 },
    )
  }

  await prisma.patientBooking.update({
    where: { id },
    data: { accountingRecorded: true },
  })

  return NextResponse.json({ ok: true })
}
