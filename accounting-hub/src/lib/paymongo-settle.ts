import type { PaymongoCheckout } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { retrieveCheckout, parsePayment } from '@/lib/paymongo'
import { postOrderJournal } from '@/lib/accounting/post-order'
import { postJournalEntry } from '@/lib/accounting/posting'
import { resolvePaymongoAccounts } from '@/lib/accounting/paymongo-accounts'

// A real user id is required for JE.createdById / Account.createdById. Prefer the
// checkout's creator; fall back to any admin so posting never fails.
export async function systemUserId(checkout: PaymongoCheckout): Promise<string | null> {
  if (checkout.createdById) return checkout.createdById
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })
  return admin?.id ?? null
}

/**
 * Settle the POS order linked to a paid PayMongo checkout: record the PAYMONGO
 * payment (net-of-fee routes to the clearing account via postOrderJournal), mark
 * the order PAID, and book the exact PayMongo fee (DR Fees / CR Clearing).
 * Idempotent — a re-run finds the order already PAID and no-ops.
 */
export async function settleLinkedOrder(checkout: PaymongoCheckout, feePhp: number) {
  if (!checkout.orderId) return
  // Never book test-mode (sandbox) payments as real orders/GL — the money is fake.
  if (!checkout.livemode) return
  const order = await prisma.order.findUnique({
    where: { id: checkout.orderId },
    select: { id: true, paymentStatus: true, branch: true },
  })
  if (!order || order.paymentStatus !== 'UNPAID') return // already settled / not found

  const uid = await systemUserId(checkout)
  if (!uid) { console.error('PayMongo settle: no user to attribute settlement'); return }

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
      where: { referenceType: 'PAYMONGO_FEE', referenceId: checkout.checkoutId }, select: { id: true },
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

/**
 * Poll PayMongo for PENDING checkouts and settle any that have been paid — a safety
 * net so a missed/unregistered webhook doesn't leave orders stuck as UNPAID. Returns
 * how many were settled. Bounded to the most recent `limit` pending checkouts.
 */
export async function syncPendingCheckouts(limit = 40): Promise<{ settled: number; checked: number }> {
  const pending = await prisma.paymongoCheckout.findMany({
    // Live-mode only — test/sandbox checkouts are never settled into real books.
    where: { status: 'PENDING', livemode: true, checkoutId: { not: '' } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  let settled = 0
  for (const rec of pending) {
    try {
      const cs = await retrieveCheckout(rec.checkoutId)
      const payment = cs?.attributes?.payments?.[0]
      const parsed = payment ? parsePayment(payment) : null
      const isPaid = parsed?.status === 'paid' || !!payment
      if (!isPaid) continue
      const updated = await prisma.paymongoCheckout.update({
        where: { id: rec.id },
        data: {
          status: 'PAID',
          paymentId: parsed?.paymentId || rec.paymentId,
          fee: parsed ? parsed.feePhp : rec.fee,
          netAmount: parsed ? parsed.netPhp : rec.netAmount,
          paidAt: parsed?.paidAt || new Date(),
          raw: (cs as object) ?? rec.raw as object,
        },
      })
      await settleLinkedOrder(updated, parsed ? parsed.feePhp : Number(rec.fee || 0))
      settled++
    } catch (e) { console.error('[PayMongo] sync retrieve failed for', rec.checkoutId, e) }
  }
  return { settled, checked: pending.length }
}
