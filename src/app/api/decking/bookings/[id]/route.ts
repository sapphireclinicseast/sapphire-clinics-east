// DELETE /api/decking/bookings/[id]
// Front-desk action: permanently delete a PENDING (or REJECTED/CANCELLED)
// booking from the client portal queue. Approved / paid bookings can't be
// deleted — cancel them first.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = new Set([
  'ADMIN', 'MARKETING_ADMIN',
  'SBEA_ADMIN', 'SBGH_ADMIN',
  'SBEA_FRONT_DESK', 'SBGH_FRONT_DESK',
])

export async function DELETE(
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
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // PAID and COMPLETED bookings represent real money / real sessions — those
  // still require explicit cancellation/refund handling, not silent deletion.
  // PENDING, APPROVED (awaiting payment), REJECTED, and CANCELLED can be deleted.
  if (booking.status === 'PAID' || booking.status === 'COMPLETED') {
    return NextResponse.json(
      { error: `Cannot delete a ${booking.status} booking — payment already processed. Cancel / refund it first.` },
      { status: 409 },
    )
  }

  // Cascade: PatientPayment has onDelete Cascade, so the pending PayMongo
  // link record is cleaned up too. The link in PayMongo becomes orphan (no
  // real harm — a payment there would just hit our webhook and be logged
  // as an unknown link id).
  await prisma.patientBooking.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
