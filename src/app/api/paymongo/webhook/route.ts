// PayMongo webhook receiver.
// Configure in the PayMongo dashboard:
//   URL: https://operations.sapphireclinicseast.org/api/paymongo/webhook
//   Events: link.payment.paid (aliased as "link.paid" in older docs)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPaymongoSignature, hasWebhookSecret } from '@/lib/paymongo'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('paymongo-signature')

  // Signature verification is strict in production. Verifies against any
  // configured branch secret (PAYMONGO_WEBHOOK_SECRET_SBEA/_SBGH) or the legacy
  // single PAYMONGO_WEBHOOK_SECRET. If none is set (first-time setup) we log a
  // warning and accept, but a secret should be set immediately after the
  // webhook is registered.
  if (hasWebhookSecret()) {
    const ok = verifyPaymongoSignature(rawBody, signature)
    if (!ok) {
      console.warn('PayMongo webhook signature verification failed')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  } else {
    console.warn('No PayMongo webhook secret set — accepting webhook unverified')
  }

  let payload: {
    data?: {
      attributes?: {
        type?: string
        data?: {
          id?: string
          attributes?: {
            status?: string
            reference_number?: string
          }
        }
      }
    }
  }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = payload?.data?.attributes?.type ?? ''
  const resource = payload?.data?.attributes?.data
  const linkId = resource?.id
  const linkStatus = resource?.attributes?.status

  // Only act on paid events. Other event types (expired, etc.) update status but don't flip the booking.
  const isPaidEvent =
    eventType === 'link.payment.paid' ||
    eventType === 'link.paid' ||
    linkStatus === 'paid'

  if (!linkId) {
    return NextResponse.json({ ok: true, skipped: 'no link id' })
  }

  const payment = await prisma.patientPayment.findUnique({
    where: { paymongoLinkId: linkId },
    select: { id: true, bookingId: true, status: true },
  })
  if (!payment) {
    return NextResponse.json({ ok: true, skipped: 'unknown link id' })
  }

  // Record the raw payload for debugging regardless
  await prisma.patientPayment.update({
    where: { id: payment.id },
    data: {
      webhookPayload: payload as unknown as object,
      status: isPaidEvent ? 'paid' : payment.status,
      paidAt: isPaidEvent ? new Date() : undefined,
    },
  })

  if (isPaidEvent) {
    await prisma.patientBooking.update({
      where: { id: payment.bookingId },
      data: { status: 'PAID', paidAt: new Date() },
    })
  }

  return NextResponse.json({ ok: true })
}
