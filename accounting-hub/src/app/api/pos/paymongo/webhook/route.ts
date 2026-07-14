import { NextResponse } from 'next/server'
import type { PaymongoCheckout } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { verifyWebhookSignature, parsePayment } from '@/lib/paymongo'
import { postOrderJournal } from '@/lib/accounting/post-order'
import { postJournalEntry } from '@/lib/accounting/posting'
import { resolvePaymongoAccounts } from '@/lib/accounting/paymongo-accounts'

// A real user id is required for JE.createdById / Account.createdById. Prefer the
// checkout's creator; fall back to any admin so webhook-time posting never fails.
async function systemUserId(checkout: PaymongoCheckout): Promise<string | null> {
  if (checkout.createdById) return checkout.createdById
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })
  return admin?.id ?? null
}

/**
 * Settle the POS order linked to a paid PayMongo checkout: record the PAYMONGO
 * payment (net-of-fee routes to the clearing account via postOrderJournal), mark
 * the order PAID, and book the exact PayMongo fee (DR Fees / CR Clearing).
 * Idempotent — a re-delivered webhook finds the order already PAID and no-ops.
 */
async function settleLinkedOrder(checkout: PaymongoCheckout, feePhp: number) {
  if (!checkout.orderId) return
  const order = await prisma.order.findUnique({
    where: { id: checkout.orderId },
    select: { id: true, paymentStatus: true, branch: true },
  })
  if (!order || order.paymentStatus !== 'UNPAID') return // already settled / not found

  const uid = await systemUserId(checkout)
  if (!uid) { console.error('PayMongo webhook: no user to attribute settlement'); return }

  const { paymentModeId, clearingAccountId, feeAccountId } = await resolvePaymongoAccounts(prisma, uid)
  const gross = Number(checkout.amount)
  const paidAt = checkout.paidAt || new Date()

  await prisma.$transaction(async (tx) => {
    await tx.orderPayment.create({
      data: { orderId: order.id, method: 'PAYMONGO', amount: gross, paymentModeId, reference: checkout.checkoutId },
    })
    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'PAID', status: 'COMPLETED', paymentDate: paidAt },
    })
  })

  // Sale JE: DR PayMongo Clearing (gross) / CR Revenue (gross). Gated by ENABLE_GL_POSTING.
  let posted = false
  try {
    const res = await postOrderJournal(prisma, order.id, uid)
    posted = res.posted || !!res.alreadyPosted
  } catch (e) { console.error('[PayMongo] order posting threw:', e) }

  // Exact fee JE: DR PayMongo Fees / CR PayMongo Clearing. Only when the sale posted
  // (else crediting clearing would be unbalanced against nothing) and not already booked.
  if (posted && feePhp > 0) {
    const dup = await prisma.journalEntry.findFirst({
      where: { referenceType: 'PAYMONGO_FEE', referenceId: checkout.checkoutId },
      select: { id: true },
    })
    if (!dup) {
      try {
        await postJournalEntry(prisma, {
          entryDate: paidAt,
          description: `PayMongo fee — ${checkout.referenceCode || checkout.checkoutId}`,
          referenceType: 'PAYMONGO_FEE',
          referenceId: checkout.checkoutId,
          branch: order.branch,
          createdById: uid,
          lines: [
            { accountId: feeAccountId, debit: feePhp, description: 'PayMongo processing fee' },
            { accountId: clearingAccountId, credit: feePhp, description: 'PayMongo processing fee' },
          ],
        })
      } catch (e) { console.error('[PayMongo] fee JE threw:', e) }
    }
  }
}

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
            },
          })
          // Phase 2: turn the paid checkout into a settled POS sale, net of fee.
          await settleLinkedOrder(updated, parsed ? parsed.feePhp : Number(existing.fee || 0))
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
            data: { status: 'PAID', paymentId: parsed.paymentId, fee: parsed.feePhp, netAmount: parsed.netPhp, paidAt: parsed.paidAt || new Date(), livemode, raw: event as object },
          })
          await settleLinkedOrder(updated, parsed.feePhp)
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
