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
  if (booking.status === 'APPROVED' || booking.status === 'PAID' || booking.status === 'COMPLETED') {
    return NextResponse.json(
      { error: `Cannot delete a ${booking.status} booking — cancel it first.` },
      { status: 409 },
    )
  }

  // Cascade: PatientPayment has onDelete Cascade, so deleting the booking is safe.
  await prisma.patientBooking.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
