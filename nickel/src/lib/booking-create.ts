import { prisma } from '@/lib/prisma'
import { createPaymongoLink } from '@/lib/paymongo'
import { computeSplit } from '@/lib/earnings'
import { patientWalletMove } from '@/lib/wallet'
import { notify } from '@/lib/notify'

export function addHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export interface StartBookingInput {
  patientId: string
  providerId: string
  providerName: string
  transpoIncluded: boolean
  city: string
  date: string        // YYYY-MM-DD
  bookedDate: Date    // UTC midnight of `date`
  startTime: string   // HH:MM
  amount: number      // provider rate to charge
  useWallet?: boolean
}
export type StartBookingResult =
  | { ok: true; bookingId: string; paid: true }
  | { ok: true; bookingId: string; checkoutUrl: string }
  | { ok: false; status: number; error: string }

// Reserve a slot, apply any Nickel wallet credit, and either settle it (fully
// covered by credit) or open a PayMongo checkout. Shared by the marketplace
// booking flow and the accept-an-offer flow.
export async function startBooking(i: StartBookingInput): Promise<StartBookingResult> {
  let applied = 0
  if (i.useWallet) {
    const pt = await prisma.patient.findUnique({ where: { id: i.patientId }, select: { walletBalance: true } })
    applied = Math.round(Math.min(Number(pt?.walletBalance ?? 0), i.amount) * 100) / 100
  }
  const toCharge = Math.round((i.amount - applied) * 100) / 100
  const fullyCovered = toCharge <= 0

  let booking: { id: string }
  try {
    booking = await prisma.$transaction(async (tx) => {
      const clash = await tx.booking.count({ where: { providerId: i.providerId, date: i.bookedDate, startTime: i.startTime, status: { notIn: ['CANCELLED'] } } })
      if (clash > 0) throw new Error('TAKEN')
      const created = await tx.booking.create({
        data: {
          patientId: i.patientId, providerId: i.providerId, city: i.city, date: i.bookedDate,
          startTime: i.startTime, endTime: addHour(i.startTime), amount: i.amount,
          transpoIncluded: i.transpoIncluded, walletApplied: applied,
          status: fullyCovered ? 'PAID' : 'PENDING',
          ...(fullyCovered ? (() => { const s = computeSplit(i.amount, { method: 'wallet' }); return { paidAt: new Date(), appFee: s.appFee, processingFee: s.processingFee, providerNet: s.net, paymentMethod: 'wallet' } })() : {}),
        },
        select: { id: true },
      })
      if (applied > 0) await patientWalletMove(tx, i.patientId, { amount: -applied, type: 'REDEEM', bookingId: created.id, note: 'Applied to booking' })
      return created
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'TAKEN') return { ok: false, status: 409, error: 'That time was just booked. Please pick another.' }
    throw e
  }

  if (fullyCovered) {
    await notify({ to: 'PROVIDER', providerId: i.providerId, bookingId: booking.id, type: 'BOOKING_PAID', title: 'New booking to confirm', body: `A patient booked and paid for a visit on ${i.date} at ${i.startTime}.` })
    return { ok: true, bookingId: booking.id, paid: true }
  }

  try {
    const link = await createPaymongoLink({
      amountPhp: toCharge,
      description: `Nickel home therapy — ${i.providerName} (${i.date} ${i.startTime})`,
      remarks: applied > 0
        ? `₱${Math.round(applied).toLocaleString('en-PH')} paid from Nickel wallet · ${i.transpoIncluded ? 'Transportation included' : 'Transportation not included'}`
        : i.transpoIncluded ? 'Transportation included' : 'Transportation not included',
    })
    await prisma.booking.update({ where: { id: booking.id }, data: { paymongoLinkId: link.id, checkoutUrl: link.checkoutUrl } })
    return { ok: true, bookingId: booking.id, checkoutUrl: link.checkoutUrl }
  } catch (e) {
    if (applied > 0) await patientWalletMove(prisma, i.patientId, { amount: applied, type: 'REFUND', bookingId: booking.id, note: 'Payment could not start' }).catch(() => {})
    await prisma.booking.delete({ where: { id: booking.id } }).catch(() => {})
    console.error('[nickel startBooking] paymongo failed:', e)
    return { ok: false, status: 502, error: 'Could not start payment. Please try again.' }
  }
}
