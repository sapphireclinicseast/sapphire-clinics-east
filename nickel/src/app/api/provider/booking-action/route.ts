import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionProviderId } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { refundBookingToWallet, releaseEarning, clinicWalletMove } from '@/lib/wallet'

// Provider acts on one of their bookings.
// action: 'confirm' (PAID→CONFIRMED) | 'decline' (→CANCELLED) | 'complete' (CONFIRMED→COMPLETED)
export async function POST(req: NextRequest) {
  const pid = await getSessionProviderId()
  if (!pid) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { bookingId?: string; action?: string }
  const bookingId = String(b.bookingId ?? '')
  if (!bookingId) return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, providerId: pid },
    select: {
      id: true, status: true, patientId: true, providerId: true, date: true, startTime: true,
      amount: true, walletApplied: true, providerNet: true, earnedAt: true, refundedAt: true,
      clinicId: true, paymentRouting: true,
      provider: { select: { firstName: true, lastName: true } },
    },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  let next: string | null = null
  if (b.action === 'confirm' && booking.status === 'PAID') next = 'CONFIRMED'
  else if (b.action === 'decline' && (booking.status === 'PAID' || booking.status === 'PENDING' || booking.status === 'CONFIRMED')) next = 'CANCELLED'
  else if (b.action === 'complete' && booking.status === 'CONFIRMED') next = 'COMPLETED'
  if (!next) return NextResponse.json({ error: `Can't ${b.action} a ${booking.status.toLowerCase()} booking.` }, { status: 409 })

  let refunded = 0
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: bookingId }, data: { status: next as never } })
    if (next === 'COMPLETED') {
      if (booking.clinicId && booking.paymentRouting === 'CLINIC_WALLET') {
        // Clinic-wallet routing: the net goes to the clinic; the clinic pays the
        // therapist's cut separately.
        if (!booking.earnedAt && booking.providerNet != null) {
          await clinicWalletMove(tx, booking.clinicId, { amount: Number(booking.providerNet), type: 'EARNING', bookingId: booking.id, note: 'Clinic-arranged visit completed' })
          await tx.booking.update({ where: { id: booking.id }, data: { earnedAt: new Date() } })
        }
      } else {
        // Release the provider's net into their wallet (money was held until now).
        await releaseEarning(tx, booking)
      }
    } else if (next === 'CANCELLED') {
      // Refund what the patient paid into their Nickel wallet.
      refunded = await refundBookingToWallet(tx, booking, 'Therapist cancelled the visit')
    }
  })

  const therapist = `${booking.provider.firstName} ${booking.provider.lastName}`
  const when = `${booking.date.toISOString().slice(0, 10)} at ${booking.startTime}`
  if (next === 'CONFIRMED') {
    await notify({ to: 'PATIENT', patientId: booking.patientId, bookingId: booking.id, type: 'BOOKING_CONFIRMED', title: 'Your visit is confirmed', body: `${therapist} confirmed your home visit on ${when}.` })
  } else if (next === 'CANCELLED') {
    await notify({ to: 'PATIENT', patientId: booking.patientId, bookingId: booking.id, type: 'BOOKING_CANCELLED', title: 'Booking cancelled', body: `${therapist} could not take your visit on ${when}.${refunded > 0 ? ` ₱${Math.round(refunded).toLocaleString('en-PH')} was refunded to your Nickel wallet.` : ''}` })
  }
  return NextResponse.json({ ok: true, status: next, refunded })
}
