import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { refundBookingToWallet } from '@/lib/wallet'

function addHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Patient accepts or declines the provider's proposed new time.
export async function POST(req: NextRequest) {
  const patientId = await getSessionPatientId()
  if (!patientId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { bookingId?: string; accept?: boolean }
  const bookingId = String(b.bookingId ?? '')

  const booking = await prisma.booking.findFirst({ where: { id: bookingId, patientId }, include: { patient: { select: { firstName: true, lastName: true } } } })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (!booking.proposedDate || !booking.proposedStartTime) return NextResponse.json({ error: 'No proposed time to respond to.' }, { status: 409 })

  const patientName = `${booking.patient.firstName} ${booking.patient.lastName}`
  if (b.accept) {
    // Move the visit to the proposed time and confirm it.
    const when = `${booking.proposedDate.toISOString().slice(0, 10)} at ${booking.proposedStartTime}`
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        date: booking.proposedDate, startTime: booking.proposedStartTime, endTime: addHour(booking.proposedStartTime),
        status: 'CONFIRMED', proposedDate: null, proposedStartTime: null, proposedAt: null,
      },
    })
    await notify({ to: 'PROVIDER', providerId: booking.providerId, bookingId: booking.id, type: 'PROPOSAL_ACCEPTED', title: 'New time accepted', body: `${patientName} accepted the new time — the visit is set for ${when}.` })
    return NextResponse.json({ ok: true, accepted: true })
  }
  // Declined the new time → cancel the visit and refund the patient to their
  // Nickel wallet (the therapist is not paid).
  let refunded = 0
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED', proposedDate: null, proposedStartTime: null, proposedAt: null } })
    refunded = await refundBookingToWallet(tx, booking, 'Declined rescheduled time')
  })
  await notify({ to: 'PROVIDER', providerId: booking.providerId, bookingId: booking.id, type: 'PROPOSAL_DECLINED', title: 'Reschedule declined — cancelled', body: `${patientName} declined the new time, so the visit was cancelled and refunded.` })
  return NextResponse.json({ ok: true, accepted: false, cancelled: true, refunded })
}
