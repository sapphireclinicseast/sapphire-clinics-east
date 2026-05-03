// POST /api/decking/bookings/[id]/reject — mark REJECTED with a reason.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({} as { reason?: string }))
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  const booking = await prisma.patientBooking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const updated = await prisma.patientBooking.update({
    where: { id },
    data: {
      status: 'REJECTED',
      rejectionReason: reason || null,
    },
  })

  return NextResponse.json({ booking: updated })
}
