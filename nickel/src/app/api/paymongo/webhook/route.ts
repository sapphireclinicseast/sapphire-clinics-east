// PayMongo webhook receiver (Verdana account).
// Configure in the PayMongo dashboard:
//   URL: https://nickelcare.com/api/paymongo/webhook
//   Events: link.payment.paid
// Set PAYMONGO_WEBHOOK_SECRET in the Nickel container env.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPaymongoSignature, hasWebhookSecret } from '@/lib/paymongo'
import { computeSplit } from '@/lib/earnings'
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

  let payload: {
    data?: { attributes?: { type?: string; data?: { id?: string; attributes?: { status?: string } } } }
  }
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const eventType = payload?.data?.attributes?.type ?? ''
  const resource = payload?.data?.attributes?.data
  const linkId = resource?.id
  const linkStatus = resource?.attributes?.status
  if (!linkId) return NextResponse.json({ ok: true, skipped: 'no link id' })

  const isPaidEvent = eventType === 'link.payment.paid' || eventType === 'link.paid' || linkStatus === 'paid'
  if (!isPaidEvent) return NextResponse.json({ ok: true, skipped: 'not a paid event' })

  const booking = await prisma.booking.findFirst({
    where: { paymongoLinkId: linkId },
    select: { id: true, status: true, amount: true, providerId: true, date: true, startTime: true, patient: { select: { firstName: true, lastName: true } } },
  })
  if (!booking) return NextResponse.json({ ok: true, skipped: 'unknown link id' })

  if (booking.status === 'PENDING') {
    // Credit the provider's wallet: record the 15% fee / 5% CWT / net split.
    const { fee, cwt, net } = computeSplit(Number(booking.amount))
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'PAID', paidAt: new Date(), platformFee: fee, withholdingTax: cwt, providerNet: net },
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
