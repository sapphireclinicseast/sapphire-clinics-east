// PayMongo webhook receiver (Verdana account).
// Configure in the PayMongo dashboard:
//   URL: https://nickelcare.com/api/paymongo/webhook
//   Events: link.payment.paid
// Set PAYMONGO_WEBHOOK_SECRET in the Nickel container env.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPaymongoSignature, hasWebhookSecret } from '@/lib/paymongo'
import { computeSplit, normalizeMethod } from '@/lib/earnings'
import { notify } from '@/lib/notify'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('paymongo-signature')

  if (hasWebhookSecret()) {
    if (!verifyPaymongoSignature(rawBody, signature)) {
      console.warn('[nickel webhook] signature verification failed')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  } else {
    console.warn('[nickel webhook] no PAYMONGO_WEBHOOK_SECRET set — accepting unverified')
  }

  interface PmPayment { attributes?: { status?: string; fee?: number; payment_method_used?: string; source?: { type?: string } } }
  let payload: {
    data?: { attributes?: { type?: string; data?: { id?: string; attributes?: { status?: string; payments?: PmPayment[] } } } }
  }
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const eventType = payload?.data?.attributes?.type ?? ''
  const resource = payload?.data?.attributes?.data
  const linkId = resource?.id
  const linkStatus = resource?.attributes?.status
  if (!linkId) return NextResponse.json({ ok: true, skipped: 'no link id' })

  // The paid payment carries the actual processor fee and the method used.
  const payments = resource?.attributes?.payments ?? []
  const pay = payments.find((p) => p?.attributes?.status === 'paid') ?? payments[0]
  const feeCentavos = pay?.attributes?.fee
  const rawMethod = pay?.attributes?.payment_method_used ?? pay?.attributes?.source?.type ?? null

  const isPaidEvent = eventType === 'link.payment.paid' || eventType === 'link.paid' || linkStatus === 'paid'
  if (!isPaidEvent) return NextResponse.json({ ok: true, skipped: 'not a paid event' })

  const booking = await prisma.booking.findFirst({
    where: { paymongoLinkId: linkId },
    select: { id: true, status: true, amount: true, walletApplied: true, providerId: true, date: true, startTime: true, patient: { select: { firstName: true, lastName: true } } },
  })
  if (!booking) {
    // Not a booking — maybe a rehab-doctor consult.
    const consult = await prisma.consult.findFirst({
      where: { paymongoLinkId: linkId },
      select: { id: true, status: true, amount: true, doctorId: true, date: true, startTime: true, mode: true, patient: { select: { firstName: true, lastName: true } } },
    })
    if (!consult) return NextResponse.json({ ok: true, skipped: 'unknown link id' })
    if (consult.status === 'PENDING') {
      const method = normalizeMethod(rawMethod)
      const { appFee, processingFee, net } = computeSplit(Number(consult.amount), { method, processingFee: typeof feeCentavos === 'number' ? feeCentavos / 100 : undefined })
      await prisma.consult.update({ where: { id: consult.id }, data: { status: 'PAID', paidAt: new Date(), appFee, processingFee, doctorNet: net, paymentMethod: method } })
      const when = `${consult.date.toISOString().slice(0, 10)} at ${consult.startTime}`
      await notify({ to: 'DOCTOR', doctorId: consult.doctorId, consultId: consult.id, type: 'CONSULT_PAID', title: 'New consult to confirm', body: `${consult.patient.firstName} ${consult.patient.lastName} booked a ${consult.mode === 'TELECONSULT' ? 'teleconsult' : 'clinic consult'} on ${when}.` })
    }
    return NextResponse.json({ ok: true })
  }

  if (booking.status === 'PENDING') {
    // Record the flat ₱20 app fee + the actual PayMongo processing fee, and the
    // therapist's net. The fee applies only to the card-charged portion (store
    // credit already applied incurs none). Prefer PayMongo's reported fee.
    const charged = Number(booking.amount) - Number(booking.walletApplied)
    const method = normalizeMethod(rawMethod)
    const { appFee, processingFee, net } = computeSplit(Number(booking.amount), {
      chargedPhp: charged,
      method,
      processingFee: typeof feeCentavos === 'number' ? feeCentavos / 100 : undefined,
    })
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'PAID', paidAt: new Date(), appFee, processingFee, providerNet: net, paymentMethod: method },
    })
    const when = `${booking.date.toISOString().slice(0, 10)} at ${booking.startTime}`
    await notify({
      to: 'PROVIDER', providerId: booking.providerId, bookingId: booking.id, type: 'BOOKING_PAID',
      title: 'New booking to confirm',
      body: `${booking.patient.firstName} ${booking.patient.lastName} booked and paid for a visit on ${when}.`,
    })
  }
  return NextResponse.json({ ok: true })
}
