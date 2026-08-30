import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId } from '@/lib/auth'
import { manilaTodayYmd } from '@/lib/availability'
import { startBooking } from '@/lib/booking-create'
import { notify } from '@/lib/notify'

// Patient accepts a therapist's offer → create the booking and start payment.
export async function POST(req: NextRequest) {
  const patientId = await getSessionPatientId()
  if (!patientId) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { offerId?: string; useWallet?: boolean }
  const offerId = String(b.offerId ?? '')

  const offer = await prisma.requestOffer.findUnique({
    where: { id: offerId },
    include: {
      request: { select: { id: true, patientId: true, city: true, status: true } },
      provider: { select: { id: true, firstName: true, lastName: true, active: true, verificationStatus: true, transpoIncluded: true } },
    },
  })
  if (!offer || offer.request.patientId !== patientId) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 })
  if (offer.status !== 'PENDING' || offer.request.status !== 'OPEN') return NextResponse.json({ error: 'This offer is no longer available.' }, { status: 409 })
  if (!offer.provider.active || offer.provider.verificationStatus !== 'VERIFIED') return NextResponse.json({ error: 'This therapist is no longer available.' }, { status: 409 })
  const date = offer.date.toISOString().slice(0, 10)
  if (date < manilaTodayYmd()) return NextResponse.json({ error: 'The offered date has passed. Ask for a new time.' }, { status: 409 })

  const r = await startBooking({
    patientId, providerId: offer.providerId, providerName: `${offer.provider.firstName} ${offer.provider.lastName}`,
    transpoIncluded: offer.provider.transpoIncluded, city: offer.request.city,
    date, bookedDate: offer.date, startTime: offer.startTime, amount: Number(offer.rate),
    useWallet: b.useWallet === true,
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })

  // Match the request: accept this offer, decline the rest, close the request.
  await prisma.$transaction([
    prisma.requestOffer.update({ where: { id: offerId }, data: { status: 'ACCEPTED', bookingId: r.bookingId } }),
    prisma.requestOffer.updateMany({ where: { requestId: offer.request.id, status: 'PENDING', id: { not: offerId } }, data: { status: 'DECLINED' } }),
    prisma.patientRequest.update({ where: { id: offer.request.id }, data: { status: 'MATCHED' } }),
  ])
  await notify({ to: 'PROVIDER', providerId: offer.providerId, bookingId: r.bookingId, type: 'OFFER_ACCEPTED', title: 'Your offer was accepted', body: `A patient accepted your offer for ${date} at ${offer.startTime}.${'paid' in r ? ' It is paid — confirm the visit.' : ' Awaiting their payment.'}` })

  if ('paid' in r) return NextResponse.json({ ok: true, bookingId: r.bookingId, paid: true, redirect: '/bookings' })
  return NextResponse.json({ ok: true, bookingId: r.bookingId, checkoutUrl: r.checkoutUrl })
}
