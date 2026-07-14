import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyWebhookSignature, parsePayment } from '@/lib/paymongo'

// PayMongo webhook (PUBLIC — no session; authenticated by HMAC signature instead).
// Register in the PayMongo dashboard for: checkout_session.payment.paid, payment.paid, payment.failed.
export async function POST(req: Request) {
  const raw = await req.text()
  const sig = req.headers.get('paymongo-signature')
  const { valid, livemode } = verifyWebhookSignature(raw, sig)
  if (!valid) {
    console.error('PayMongo webhook: invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event: any = JSON.parse(raw)
    const type: string = event?.data?.attributes?.type || ''
    const resource = event?.data?.attributes?.data // checkout_session (for cs events) or payment

    if (type === 'checkout_session.payment.paid') {
      const checkoutId: string = resource?.id || ''
      const payment = resource?.attributes?.payments?.[0]
      const parsed = payment ? parsePayment(payment) : null
      if (checkoutId) {
        const existing = await prisma.paymongoCheckout.findUnique({ where: { checkoutId } })
        if (existing) {
          await prisma.paymongoCheckout.update({
            where: { checkoutId },
            data: {
              status: 'PAID',
              paymentId: parsed?.paymentId || existing.paymentId,
              fee: parsed ? parsed.feePhp : existing.fee,
              netAmount: parsed ? parsed.netPhp : existing.netAmount,
              paidAt: parsed?.paidAt || new Date(),
              livemode,
              raw: event as object,
            },
          })
        } else {
          console.warn('PayMongo webhook: no local checkout for', checkoutId)
        }
      }
    } else if (type === 'payment.paid') {
      // Standalone payment (e.g. Payment Intent flows). Best-effort link by reference/metadata.
      const parsed = parsePayment(resource)
      const ref = resource?.attributes?.metadata?.referenceCode || resource?.attributes?.description
      if (ref) {
        const match = await prisma.paymongoCheckout.findFirst({ where: { referenceCode: ref, status: 'PENDING' } })
        if (match) {
          await prisma.paymongoCheckout.update({
            where: { id: match.id },
            data: { status: 'PAID', paymentId: parsed.paymentId, fee: parsed.feePhp, netAmount: parsed.netPhp, paidAt: parsed.paidAt || new Date(), livemode, raw: event as object },
          })
        }
      }
    } else if (type === 'payment.failed') {
      const checkoutId: string = resource?.id || ''
      if (checkoutId) {
        await prisma.paymongoCheckout.updateMany({ where: { checkoutId, status: 'PENDING' }, data: { status: 'FAILED', raw: event as object } })
      }
    }

    // Always 200 so PayMongo doesn't retry indefinitely on handled/ignored events.
    return NextResponse.json({ received: true })
  } catch (e) {
    console.error('PayMongo webhook processing error:', e)
    // Still 200 — the signature was valid; a processing bug shouldn't trigger infinite retries.
    return NextResponse.json({ received: true, error: e instanceof Error ? e.message : 'error' })
  }
}
