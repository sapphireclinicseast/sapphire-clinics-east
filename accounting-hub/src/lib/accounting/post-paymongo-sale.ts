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
 */

import type { PrismaClient } from '@prisma/client'
import { postJournalEntry } from './posting'
import { resolvePaymongoAccounts } from './paymongo-accounts'

export interface PaymongoSaleResult { posted: boolean; reason?: string; journalEntryId?: string }

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
  // Links recorded as a POS order are posted by postOrderJournal — don't double-count.
  if (co.orderId) return { posted: false, reason: 'posted via POS order' }

  // Idempotency: one JE per checkout.
  const existing = await prisma.journalEntry.findFirst({
    where: { referenceType: 'PAYMONGO_SALE', referenceId: co.checkoutId },
    select: { id: true },
  })
  if (existing) return { posted: false, reason: 'already posted', journalEntryId: existing.id }

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

  const pmAccts = await resolvePaymongoAccounts(prisma, opts.userId)

  const lines: { accountId: string; debit?: number; credit?: number; description?: string }[] = [
    { accountId: pmAccts.clearingAccountId, debit: net, credit: 0, description: `PayMongo clearing — ${label}` },
  ]
  if (fee > 0) lines.push({ accountId: pmAccts.feeAccountId, debit: fee, credit: 0, description: 'PayMongo fee' })
  lines.push({
    accountId: unearned.id, debit: 0, credit: charged,
    description: `Collected online — ${label}${co.voucherCode ? ` (voucher ${co.voucherCode})` : ''}`,
  })

  const je = await postJournalEntry(prisma, {
    entryDate: co.paidAt || new Date(),
    description: `PayMongo collection — ${label}${co.voucherCode ? ` (voucher ${co.voucherCode})` : ''}`,
    referenceType: 'PAYMONGO_SALE',
    referenceId: co.checkoutId,
    branch: co.branch || 'ALL',
    createdById: opts.userId,
    lines,
  })

  return { posted: true, journalEntryId: je.id }
}
