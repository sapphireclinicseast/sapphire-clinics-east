/**
 * Post a paid PayMongo payment link to the general ledger as a COLLECTION, not a sale.
 *
 *   DR PayMongo Clearing (asset)      net (charged − processor fee)
 *   DR PayMongo Fees (expense)        fee
 *     CR Unearned Revenue (liability) charged
 *
 * Balances because net + fee = charged.
 *
 * Why not revenue: paying online is not the same event as receiving the service. The
 * cashier's order — generated from the clinic schedule when the session actually happens —
 * is what recognises revenue. Booking revenue here as well would count it twice. So the
 * money sits in 4050 Unearned Revenue (a liability: we owe the patient a session) until
 * that order draws it down.
 *
 * Consequences that follow from that, deliberately:
 *   · A voucher discount is NOT broken out here. The patient's price IS the discounted
 *     amount, and the promo belongs with the revenue when it is recognised.
 *   · A product sale takes nothing out of stock and books no COGS. Inventory leaves when
 *     the goods are handed over and the order records it, not when the money arrives.
 *   · The processor fee IS expensed now — PayMongo has already done its collecting.
 *
 * referenceType is PAYMONGO_SALE (never POS_ORDER). Nothing lands in the Income Statement
 * from this entry; it moves the balance sheet only.
 *
 * WHO CALLS THIS: every path that learns a link was paid — the PayMongo webhook, the POS
 * "sync pending" safety net, the PayMongo tab's Sync button, Convert-to-Order (as a
 * catch-up before it raises the order) and the opt-in `paymongo-sales` backfill bucket.
 * The owner's rule is that the ledger needs no click, so the webhook is the normal
 * poster and everything else is a safety net that must find the entry already there.
 *
 * IDEMPOTENCY: one PAYMONGO_SALE entry per checkout, enforced under a Postgres
 * transaction-scoped advisory lock keyed on the checkout id. A duplicate webhook
 * delivery, a Sync click racing the webhook, or two Sync clicks at once all serialise
 * on that lock, and the loser sees the winner's committed entry and returns
 * `already posted`. (The old read-then-insert check had the same same-second race
 * that double-reversed POS order #41717.)
 *
 * The later order that draws this collection down is posted by postOrderJournal, which
 * recognises a PayMongo leg whose checkout already carries a PAYMONGO_SALE entry and
 * routes it DR 4050 instead of DR the payment-mode cash account — so the money is
 * never counted twice between the two entries.
 */

import type { Prisma, PrismaClient } from '@prisma/client'
import { postJournalEntry } from './posting'
import { resolvePaymongoAccounts } from './paymongo-accounts'
import { orderGlNetCents } from './post-order'

export interface PaymongoSaleResult { posted: boolean; reason?: string; journalEntryId?: string }

/** Reasons that mean "nothing to do", not "something went wrong". */
export const PAYMONGO_SALE_BENIGN_REASONS = ['already posted', 'GL posting off', 'test mode', 'posted via POS order'] as const

export async function postPaymongoSale(
  prisma: PrismaClient,
  opts: { checkoutId: string; userId: string },
): Promise<PaymongoSaleResult> {
  if (process.env.ENABLE_GL_POSTING !== 'true') return { posted: false, reason: 'GL posting off' }

  const co = await prisma.paymongoCheckout.findUnique({ where: { checkoutId: opts.checkoutId } })
  if (!co) return { posted: false, reason: 'checkout not found' }
  if (co.status !== 'PAID') return { posted: false, reason: 'not paid' }
  // Test-mode money never enters the real books.
  if (!co.livemode) return { posted: false, reason: 'test mode' }
  // A checkout tied to a POS order whose sale ALREADY stands in the GL in cash form
  // (DR payment-mode account / CR revenue, the POS-links flow settled by
  // settleLinkedOrder) carries its money through that entry — a collection entry on
  // top would count the cash twice. A linked order with NO standing entry (converted
  // before Convert-to-Order posted anything) is not covered: post the collection and
  // let postOrderJournal draw it down when the order is backfilled.
  if (co.orderId && (await orderGlNetCents(prisma, co.orderId)) > 0) {
    return { posted: false, reason: 'posted via POS order' }
  }

  const charged = Number(co.amount)
  const fee = co.fee != null ? Number(co.fee) : 0
  const net = co.netAmount != null ? Number(co.netAmount) : charged - fee
  if (!(charged > 0)) return { posted: false, reason: 'zero amount' }

  const label = co.itemName || co.description || 'PayMongo payment'

  // 4050 Unearned Revenue — the liability the collection creates.
  const unearned = await prisma.account.findFirst({
    where: { accountNumber: '4050' },
    select: { id: true },
  })
  if (!unearned) return { posted: false, reason: 'no 4050 Unearned Revenue account in the chart of accounts' }

  // May create accounts/modes on first use — keep it outside the locked transaction.
  const pmAccts = await resolvePaymongoAccounts(prisma, opts.userId)

  const lines: { accountId: string; debit?: number; credit?: number; description?: string }[] = [
    { accountId: pmAccts.clearingAccountId, debit: net, credit: 0, description: `PayMongo clearing — ${label}` },
  ]
  if (fee > 0) lines.push({ accountId: pmAccts.feeAccountId, debit: fee, credit: 0, description: 'PayMongo fee' })
  lines.push({
    accountId: unearned.id, debit: 0, credit: charged,
    description: `Collected online — ${label}${co.voucherCode ? ` (voucher ${co.voucherCode})` : ''}`,
  })

  const lockKey = `PAYMONGO_SALE:${co.checkoutId}`
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Serialise every poster of this checkout. The lock is released at commit/rollback,
    // and the existence check below runs AFTER the lock is held, so it sees whatever a
    // concurrent winner committed.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`
    const existing = await tx.journalEntry.findFirst({
      where: { referenceType: 'PAYMONGO_SALE', referenceId: co.checkoutId },
      select: { id: true },
    })
    if (existing) return { posted: false, reason: 'already posted', journalEntryId: existing.id }

    const je = await postJournalEntry(tx, {
      entryDate: co.paidAt || new Date(),
      description: `PayMongo collection — ${label}${co.voucherCode ? ` (voucher ${co.voucherCode})` : ''}`,
      referenceType: 'PAYMONGO_SALE',
      referenceId: co.checkoutId,
      branch: co.branch || 'ALL',
      createdById: opts.userId,
      lines,
    })
    return { posted: true, journalEntryId: je.id }
  })
}
