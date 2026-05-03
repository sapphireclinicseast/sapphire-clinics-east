// GET /api/public/bookings/[id]/pay?token=...
// Returns the PayMongo checkout URL for this booking if it is APPROVED and
// has a pending payment link. The client portal redirects to that URL.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { preflight, withCors } from '../../../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const origin = req.headers.get('origin')
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token') ?? ''
  const session = verifyPatientToken(token)
  if (!session) return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)

  const { id } = await params
  const booking = await prisma.patientBooking.findUnique({
    where: { id },
    include: { payment: true },
  })
  if (!booking || booking.patientId !== session.patientId) {
    return withCors(NextResponse.json({ error: 'Not found' }, { status: 404 }), origin)
  }
  if (booking.status !== 'APPROVED') {
    return withCors(
      NextResponse.json(
        { error: `Booking is ${booking.status}, not APPROVED` },
        { status: 409 },
      ),
      origin,
    )
  }
  if (!booking.payment?.checkoutUrl) {
    return withCors(NextResponse.json({ error: 'No payment link' }, { status: 404 }), origin)
  }

  return withCors(
    NextResponse.json({
      checkoutUrl: booking.payment.checkoutUrl,
      amount: Number(booking.payment.amount),
      status: booking.payment.status,
    }),
    origin,
  )
}
