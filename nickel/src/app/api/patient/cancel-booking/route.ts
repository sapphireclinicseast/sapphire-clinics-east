import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { refundBookingToWallet } from '@/lib/wallet'

// Patient cancels their own home-visit booking. Any amount paid is refunded to
// their Nickel wallet.
export async function POST(req: NextRequest) {
  const patientId = await getSessionPatientId()
  if (!patientId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { bookingId?: string }
  const bookingId = String(b.bookingId ?? '')

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, patientId },
    select: { id: true, status: true, patientId: true, providerId: true, amount: true, walletApplied: true, providerNet: true, earnedAt: true, refundedAt: true, date: true, startTime: true },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (!['PENDING', 'PAID', 'CONFIRMED'].includes(booking.status)) return NextResponse.json({ error: `Can't cancel a ${booking.status.toLowerCase()} booking.` }, { status: 409 })

  let refunded = 0
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } })
    refunded = await refundBookingToWallet(tx, booking, 'You cancelled this booking')
  })
  const when = `${booking.date.toISOString().slice(0, 10)} at ${booking.startTime}`
  await notify({ to: 'PROVIDER', providerId: booking.providerId, bookingId, type: 'BOOKING_CANCELLED', title: 'A booking was cancelled', body: `The patient cancelled the visit on ${when}.` })
  return NextResponse.json({ ok: true, refunded })
}
