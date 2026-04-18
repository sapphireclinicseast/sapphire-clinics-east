// POST /api/public/bookings/[id]/cancel
// Body: { token }
// Marks a booking as CANCELLED. The patient may cancel while the request is
// still PENDING or APPROVED (awaiting payment). Cancelling a PAID booking
// requires front-desk involvement — this endpoint refuses 409 in that case.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { preflight, withCors } from '../../../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const origin = req.headers.get('origin')
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { token?: string }
  const session = verifyPatientToken(body.token ?? '')
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  const booking = await prisma.patientBooking.findUnique({
    where: { id },
    select: { id: true, patientId: true, status: true },
  })
  if (!booking || booking.patientId !== session.patientId) {
    return withCors(NextResponse.json({ error: 'Booking not found' }, { status: 404 }), origin)
  }
  if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED' || booking.status === 'REJECTED') {
    return withCors(
      NextResponse.json({ error: `Already ${booking.status}` }, { status: 409 }),
      origin,
    )
  }
  if (booking.status === 'PAID') {
    return withCors(
      NextResponse.json(
        { error: 'This booking has already been paid — please contact the front desk to arrange cancellation or refund.' },
        { status: 409 },
      ),
      origin,
    )
  }

  const updated = await prisma.patientBooking.update({
    where: { id },
    data: { status: 'CANCELLED' },
    select: { id: true, status: true },
  })
  return withCors(NextResponse.json({ booking: updated }), origin)
}
