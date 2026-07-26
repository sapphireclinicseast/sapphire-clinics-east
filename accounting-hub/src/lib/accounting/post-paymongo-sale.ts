/**
 * Post a paid PayMongo payment link (the per-branch links generated on the PayMongo page)
 * to the general ledger, so the sale — and any voucher discount — shows in the reports.
 *
 *   DR PayMongo Clearing (asset)        net (charged − processor fee)
 *   DR PayMongo Fees                    fee
 *   DR Voucher Discount (contra-rev)    discount        ← makes the promo visible in the P&L
 *     CR Service/Product Revenue        gross (list price before the voucher)
 *
 *   and for a product, the usual FIFO pair:
 *   DR COGS  /  CR Inventory            cost of the units sold
 *
 * Balance holds because charged = gross − discount and net = charged − fee, so
 * net + fee + discount = gross.
 *
 * If the voucher has no COA account set we credit revenue NET of the discount instead of
 * inventing a discount line — the books stay balanced, the promo just isn't broken out.
 *
 * referenceType is PAYMONGO_SALE (never POS_ORDER), so the Income Statement's journal fold
 * picks it up: credit-normal revenue adds to revenue, and a DEBIT-normal discount account
 * lands in "Discounts and Refunds" as a deduction.
 */

import type { PrismaClient } from '@prisma/client'
import { postJournalEntry } from './posting'
import { resolvePaymongoAccounts } from './paymongo-accounts'
import { consumeFifoLots, recalcWeightedUnitCost } from '@/lib/fifo'

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
  const gross = co.grossAmount != null ? Number(co.grossAmount) : charged
  const discount = co.discountAmount != null ? Number(co.discountAmount) : 0
  const fee = co.fee != null ? Number(co.fee) : 0
  const net = co.netAmount != null ? Number(co.netAmount) : charged - fee
  if (!(charged > 0)) return { posted: false, reason: 'zero amount' }

  // ── Revenue account: from the Service or the Inventory product ──
  let revenueAccountId: string | null = null
  let label = co.itemName || co.description || 'PayMongo sale'
  let product: {
    id: string; name: string; quantity: number
    expenseAccountId: string | null
    sourceAccountId: string | null
  } | null = null

  if (co.serviceId) {
    const svc = await prisma.service.findUnique({ where: { id: co.serviceId }, select: { name: true, revenueAccountId: true } })
    if (!svc) return { posted: false, reason: 'service not found' }
    revenueAccountId = svc.revenueAccountId
    label = svc.name
    if (!revenueAccountId) return { posted: false, reason: `service "${svc.name}" has no revenue account` }
  } else if (co.inventoryItemId) {
    const inv = await prisma.inventoryItem.findUnique({
      where: { id: co.inventoryItemId },
      select: { id: true, name: true, quantity: true, revenueAccountId: true, expenseAccountId: true, sourceAccountId: true },
    })
    if (!inv) return { posted: false, reason: 'product not found' }
    revenueAccountId = inv.revenueAccountId
    label = inv.name
    product = { id: inv.id, name: inv.name, quantity: inv.quantity, expenseAccountId: inv.expenseAccountId, sourceAccountId: inv.sourceAccountId }
    if (!revenueAccountId) return { posted: false, reason: `product "${inv.name}" has no revenue account` }
  } else {
    return { posted: false, reason: 'no service or product linked' }
  }

  // ── Voucher discount account (optional) ──
  let discountAccountId: string | null = null
  if (discount > 0 && co.voucherId) {
    const v = await prisma.voucher.findUnique({ where: { id: co.voucherId }, select: { accountId: true } })
    discountAccountId = v?.accountId || null
  }
  // Without a discount account we recognise revenue net of the discount instead.
  const revenueCredit = discountAccountId && discount > 0 ? gross : charged

  const pmAccts = await resolvePaymongoAccounts(prisma, opts.userId)

  const lines: { accountId: string; debit?: number; credit?: number; description?: string }[] = [
    { accountId: pmAccts.clearingAccountId, debit: net, credit: 0, description: `PayMongo clearing — ${label}` },
  ]
  if (fee > 0) lines.push({ accountId: pmAccts.feeAccountId, debit: fee, credit: 0, description: 'PayMongo fee' })
  if (discountAccountId && discount > 0) {
    lines.push({ accountId: discountAccountId, debit: discount, credit: 0, description: `Voucher ${co.voucherCode || ''} — ${label}`.trim() })
  }
  lines.push({ accountId: revenueAccountId, debit: 0, credit: revenueCredit, description: label })

  const qty = Math.max(1, co.quantity || 1)

  const je = await prisma.$transaction(async (tx) => {
    // Product: take the units out of stock at FIFO cost and book the COGS pair.
    if (product) {
      const cogsAccountId = product.expenseAccountId
      let invAccountId: string | null = null
      if (product.sourceAccountId) {
        const src = await tx.account.findUnique({ where: { id: product.sourceAccountId }, select: { id: true, accountType: true } })
        if (src?.accountType === 'ASSET') invAccountId = src.id
      }
      if (cogsAccountId && invAccountId) {
        const fifo = await consumeFifoLots(tx, product.id, qty)
        const cost = Number(fifo?.totalCost || 0)
        if (cost > 0) {
          lines.push({ accountId: cogsAccountId, debit: cost, credit: 0, description: `COGS — ${product.name}` })
          lines.push({ accountId: invAccountId, debit: 0, credit: cost, description: `Inventory out — ${product.name}` })
        }
        await tx.inventoryItem.update({ where: { id: product.id }, data: { quantity: { decrement: qty } } })
        const nc = await recalcWeightedUnitCost(tx, product.id)
        if (nc > 0) await tx.inventoryItem.update({ where: { id: product.id }, data: { unitCost: nc } })
      }
      // No COGS/inventory account configured → revenue is still posted; stock is untouched
      // rather than silently going negative. Surfaced via the returned reason upstream.
    }

    return postJournalEntry(tx, {
      entryDate: co.paidAt || new Date(),
      description: `PayMongo sale — ${label}${co.voucherCode ? ` (voucher ${co.voucherCode})` : ''}`,
      referenceType: 'PAYMONGO_SALE',
      referenceId: co.checkoutId,
      branch: co.branch || 'ALL',
      createdById: opts.userId,
      lines,
    })
  })

  return { posted: true, journalEntryId: je.id }
}
