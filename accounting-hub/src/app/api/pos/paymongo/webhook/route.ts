import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyWebhookSignature, parsePayment, resolvePaymentMethodUsed } from '@/lib/paymongo'
import { recordPaidCheckout } from '@/lib/paymongo-settle'

// PayMongo webhook (PUBLIC — no session; authenticated by HMAC signature instead).
// Register in the PayMongo dashboard for: checkout_session.payment.paid, payment.paid, payment.failed.
//
// A paid event does two things, in order: flip our checkout row to PAID, then book the
// money (recordPaidCheckout — the collection entry for a payment link, or the settled
// order for a POS-links checkout). The booking is idempotent under a per-checkout lock,
// so PayMongo's retries and a Sync click racing this handler cannot post it twice.
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
          const updated = await prisma.paymongoCheckout.update({
            where: { checkoutId },
            data: {
              status: 'PAID',
              paymentId: parsed?.paymentId || existing.paymentId,
              fee: parsed ? parsed.feePhp : existing.fee,
              netAmount: parsed ? parsed.netPhp : existing.netAmount,
              paidAt: parsed?.paidAt || new Date(),
              livemode,
              raw: event as object,
              // Which instrument paid — the Sync path records this too; Convert-to-Order
              // uses it to tag the order's payment mode instead of guessing.
              ...(payment && resolvePaymentMethodUsed(payment) ? { paymentMethodUsed: resolvePaymentMethodUsed(payment) } : {}),
            },
          })
          // Book it: settled POS sale for a linked order, collection entry for a payment link.
          await recordPaidCheckout(updated, parsed ? parsed.feePhp : Number(existing.fee || 0))
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
          const updated = await prisma.paymongoCheckout.update({
            where: { id: match.id },
            data: {
              status: 'PAID', paymentId: parsed.paymentId, fee: parsed.feePhp, netAmount: parsed.netPhp, paidAt: parsed.paidAt || new Date(), livemode, raw: event as object,
              ...(resolvePaymentMethodUsed(resource) ? { paymentMethodUsed: resolvePaymentMethodUsed(resource) } : {}),
            },
          })
          await recordPaidCheckout(updated, parsed.feePhp)
        }
      }
    } else if (type === 'payment.failed') {
      // The resource here is a *payment* (pay_…), not a checkout session, so its id never
      // matches PaymongoCheckout.checkoutId. Link back to our checkout via the session's
      // payment intent (a PENDING row's `raw` is still the creation payload, which embeds
      // payment_intent), falling back to the metadata referenceCode that checkout sessions
      // copy onto their payments. Only PENDING rows are touched: a delayed failed event
      // must not clobber a PAID row, and a retried payment that later succeeds still lands
      // via checkout_session.payment.paid, which matches by checkoutId regardless of status.
      const attrs = resource?.attributes || {}
      const intentId: string = attrs.payment_intent_id || ''
      const ref: string = attrs.metadata?.referenceCode || attrs.description || ''
      let match = intentId
        ? await prisma.paymongoCheckout.findFirst({
            where: { status: 'PENDING', raw: { path: ['attributes', 'payment_intent', 'id'], equals: intentId } },
          })
        : null
      if (!match && ref) {
        match = await prisma.paymongoCheckout.findFirst({ where: { referenceCode: ref, status: 'PENDING' } })
      }
      if (match) {
        await prisma.paymongoCheckout.update({ where: { id: match.id }, data: { status: 'FAILED', raw: event as object } })
      } else {
        console.warn('PayMongo webhook: payment.failed with no matching pending checkout', resource?.id || '')
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
