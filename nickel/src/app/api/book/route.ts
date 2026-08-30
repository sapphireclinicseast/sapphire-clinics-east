import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId } from '@/lib/auth'
import { isValidSlot, ymdToDate, manilaTodayYmd } from '@/lib/availability'
import { createPaymongoLink } from '@/lib/paymongo'
import { computeSplit } from '@/lib/earnings'
import { patientWalletMove } from '@/lib/wallet'
import { notify } from '@/lib/notify'

function addHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export async function POST(req: NextRequest) {
  const patientId = await getSessionPatientId()
  if (!patientId) return NextResponse.json({ error: 'Please sign in to book.' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { providerId?: string; date?: string; startTime?: string; city?: string; useWallet?: boolean }
  const providerId = String(b.providerId ?? '')
  const date = String(b.date ?? '')
  const startTime = String(b.startTime ?? '')
  const city = String(b.city ?? '').trim()
  const useWallet = b.useWallet === true
  if (!providerId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime) || !city) {
    return NextResponse.json({ error: 'Missing booking details' }, { status: 400 })
  }
  if (date < manilaTodayYmd()) return NextResponse.json({ error: 'That date has passed. Please pick another.' }, { status: 409 })

  const provider = await prisma.provider.findUnique({ where: { id: providerId }, include: { slots: true } })
  if (!provider || !provider.active || provider.verificationStatus !== 'VERIFIED' || provider.rate == null) return NextResponse.json({ error: 'Therapist is not available.' }, { status: 409 })
  if (!provider.citiesCovered.includes(city)) return NextResponse.json({ error: 'This therapist does not cover that city.' }, { status: 409 })

  const bookedRows = await prisma.booking.findMany({
    where: { providerId, date: { gte: ymdToDate(manilaTodayYmd()) }, status: { notIn: ['CANCELLED'] } },
    select: { date: true, startTime: true },
  })
  const booked = new Set(bookedRows.map((r) => `${r.date.toISOString().slice(0, 10)}|${r.startTime}`))
  if (!isValidSlot(provider.slots, booked, date, startTime, provider.travelBuffer ? 120 : 60)) {
    return NextResponse.json({ error: 'That time is no longer available. Please pick another.' }, { status: 409 })
  }

  const amount = Number(provider.rate)
  const bookedDate = ymdToDate(date)

  // How much store credit to apply (capped at the session fee).
  let applied = 0
  if (useWallet) {
    const pt = await prisma.patient.findUnique({ where: { id: patientId }, select: { walletBalance: true } })
    applied = Math.min(Number(pt?.walletBalance ?? 0), amount)
    applied = Math.round(applied * 100) / 100
  }
  const toCharge = Math.round((amount - applied) * 100) / 100

  // Reserve the slot transactionally (guards against a double-book race), redeem
  // any store credit, and — if credit covers the whole fee — settle it right away.
  let booking: { id: string }
  const fullyCovered = toCharge <= 0
  try {
    booking = await prisma.$transaction(async (tx) => {
      const clash = await tx.booking.count({ where: { providerId, date: bookedDate, startTime, status: { notIn: ['CANCELLED'] } } })
      if (clash > 0) throw new Error('TAKEN')
      const created = await tx.booking.create({
        data: {
          patientId, providerId, city, date: bookedDate, startTime, endTime: addHour(startTime),
          amount, transpoIncluded: provider.transpoIncluded, walletApplied: applied,
          status: fullyCovered ? 'PAID' : 'PENDING',
          ...(fullyCovered ? (() => { const s = computeSplit(amount); return { paidAt: new Date(), platformFee: s.fee, withholdingTax: s.cwt, providerNet: s.net } })() : {}),
        },
        select: { id: true },
      })
      if (applied > 0) await patientWalletMove(tx, patientId, { amount: -applied, type: 'REDEEM', bookingId: created.id, note: 'Applied to booking' })
      return created
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'TAKEN') return NextResponse.json({ error: 'That time was just booked. Please pick another.' }, { status: 409 })
    throw e
  }

  // Paid entirely from the wallet — no PayMongo step; notify the provider as if paid.
  if (fullyCovered) {
    await notify({ to: 'PROVIDER', providerId, bookingId: booking.id, type: 'BOOKING_PAID', title: 'New booking to confirm', body: `A patient booked and paid for a visit on ${date} at ${startTime}.` })
    return NextResponse.json({ bookingId: booking.id, paid: true, redirect: '/bookings' })
  }

  try {
    const link = await createPaymongoLink({
      amountPhp: toCharge,
      description: `Nickel home therapy — ${provider.firstName} ${provider.lastName} (${date} ${startTime})`,
      remarks: applied > 0
        ? `₱${Math.round(applied).toLocaleString('en-PH')} paid from Nickel wallet · ${provider.transpoIncluded ? 'Transportation included' : 'Transportation not included'}`
        : provider.transpoIncluded ? 'Transportation included' : 'Transportation not included',
    })
    await prisma.booking.update({ where: { id: booking.id }, data: { paymongoLinkId: link.id, checkoutUrl: link.checkoutUrl } })
    return NextResponse.json({ bookingId: booking.id, checkoutUrl: link.checkoutUrl })
  } catch (e) {
    // Roll back: give any redeemed credit back, then drop the reservation.
    if (applied > 0) await patientWalletMove(prisma, patientId, { amount: applied, type: 'REFUND', bookingId: booking.id, note: 'Payment could not start' }).catch(() => {})
    await prisma.booking.delete({ where: { id: booking.id } }).catch(() => {})
    console.error('[nickel book] paymongo failed:', e)
    return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 502 })
  }
}
