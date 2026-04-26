/**
 * Tier 3 Step 5 — Inventory Adjustment auto-posting.
 *
 *   INCREASE (stock-in):
 *     DR Inventory ASSET (item.sourceAccount if ASSET, else default 13xx)
 *       CR sourceAccount (LIABILITY/AP) or default Cash if ASSET-typed
 *
 *   SHRINKAGE (write-off):
 *     DR Inventory Shrinkage / Loss expense (8xxx)
 *       CR Inventory ASSET
 *
 * Cost basis = totalLandedCost ?? localCost*qty ?? currentUnitCost*qty.
 *
 * Gated by ENABLE_GL_POSTING. Non-fatal: returns { posted, reason }.
 */

import type { PrismaClient } from '@prisma/client'
import { postJournalEntry, UnbalancedJournalEntryError, type PostingLine } from './posting'

export interface PostInvAdjResult {
  posted: boolean
  reason?: string
  journalEntryId?: string
}

async function findShrinkageAccount(prisma: PrismaClient) {
  // Try common shrinkage / loss / damage / write-off accounts under EXPENSE.
  return prisma.account.findFirst({
    where: {
      accountType: 'EXPENSE',
      OR: [
        { accountTitle: { contains: 'shrinkage', mode: 'insensitive' } },
        { accountTitle: { contains: 'loss',      mode: 'insensitive' } },
        { accountTitle: { contains: 'damage',    mode: 'insensitive' } },
        { accountTitle: { contains: 'write-off', mode: 'insensitive' } },
        { accountTitle: { contains: 'spoilage',  mode: 'insensitive' } },
      ],
    },
    select: { id: true, accountNumber: true, accountTitle: true },
  })
}

async function findDefaultInventoryAccount(prisma: PrismaClient) {
  return prisma.account.findFirst({
    where: {
      accountType: 'ASSET',
      OR: [
        { accountTitle: { contains: 'inventory',   mode: 'insensitive' } },
        { accountTitle: { contains: 'merchandise', mode: 'insensitive' } },
        { accountNumber: { startsWith: '13' } },
      ],
    },
    select: { id: true, accountNumber: true, accountTitle: true, accountType: true },
  })
}

async function findDefaultCashAccount(prisma: PrismaClient) {
  return prisma.account.findFirst({
    where: {
      accountType: 'ASSET',
      OR: [
        { accountNumber: { startsWith: '10' } },
        { accountTitle: { contains: 'cash', mode: 'insensitive' } },
        { accountTitle: { contains: 'bank', mode: 'insensitive' } },
      ],
    },
    orderBy: { accountNumber: 'asc' },
    select: { id: true, accountNumber: true, accountTitle: true, accountType: true },
  })
}

export async function postInventoryAdjustmentJournal(
  prisma: PrismaClient,
  adjustmentId: string,
  createdById: string,
): Promise<PostInvAdjResult> {
  if (process.env.ENABLE_GL_POSTING !== 'true') {
    return { posted: false, reason: 'ENABLE_GL_POSTING flag is off' }
  }

  const adj = await prisma.inventoryAdjustment.findUnique({
    where: { id: adjustmentId },
    include: {
      item: {
        select: {
          name: true, unitCost: true, branch: true,
          sourceAccount: { select: { id: true, accountNumber: true, accountTitle: true, accountType: true } },
        },
      },
    },
  })
  if (!adj) return { posted: false, reason: 'inventory adjustment not found' }

  const qty = adj.quantityChange
  if (qty <= 0) return { posted: false, reason: 'zero-quantity adjustment — nothing to post' }

  // Cost basis (PHP)
  const costAmount = adj.totalLandedCost
    ? Number(adj.totalLandedCost)
    : adj.localCost
      ? Number(adj.localCost) * qty
      : Number(adj.item.unitCost || 0) * qty
  if (costAmount <= 0) return { posted: false, reason: 'cost basis is zero — nothing to post' }

  const lines: PostingLine[] = []

  if (adj.type === 'INCREASE') {
    // Inventory ASSET side (DR)
    const invAcct = adj.item.sourceAccount?.accountType === 'ASSET'
      ? adj.item.sourceAccount
      : await findDefaultInventoryAccount(prisma)
    if (!invAcct) return { posted: false, reason: 'no inventory ASSET account resolvable' }

    // Funding side (CR): if sourceAccount is LIABILITY → AP; else assume cash purchase.
    let fundingAcct = adj.item.sourceAccount?.accountType === 'LIABILITY'
      ? adj.item.sourceAccount
      : null
    if (!fundingAcct) {
      // Cash-funded purchase. CR a cash account.
      const cashAcct = await findDefaultCashAccount(prisma)
      if (!cashAcct) return { posted: false, reason: 'no funding account: source not LIABILITY and no default cash account exists' }
      fundingAcct = cashAcct
    }

    lines.push({ accountId: invAcct.id,     debit:  costAmount, description: `Stock-in — ${adj.item.name} (${qty} units)` })
    lines.push({ accountId: fundingAcct.id, credit: costAmount, description: `Funding — ${adj.item.name} (${qty} units)` })
  } else if (adj.type === 'SHRINKAGE') {
    const lossAcct = await findShrinkageAccount(prisma)
    if (!lossAcct) return { posted: false, reason: 'no shrinkage/loss EXPENSE account configured' }

    const invAcct = adj.item.sourceAccount?.accountType === 'ASSET'
      ? adj.item.sourceAccount
      : await findDefaultInventoryAccount(prisma)
    if (!invAcct) return { posted: false, reason: 'no inventory ASSET account resolvable' }

    lines.push({ accountId: lossAcct.id, debit:  costAmount, description: `Shrinkage — ${adj.item.name} (${qty} units)` })
    lines.push({ accountId: invAcct.id,  credit: costAmount, description: `Inventory write-off — ${adj.item.name}` })
  } else {
    return { posted: false, reason: `unhandled adjustment type ${adj.type}` }
  }

  try {
    const je = await postJournalEntry(prisma, {
      entryDate:     adj.adjustmentDate,
      description:   `Inventory ${adj.type} — ${adj.item.name} ×${qty}`,
      referenceType: `INVENTORY_${adj.type}`,
      referenceId:   adj.id,
      branch:        adj.item.branch || 'ALL',
      createdById,
      lines,
    })
    return { posted: true, journalEntryId: je.id }
  } catch (e) {
    if (e instanceof UnbalancedJournalEntryError) {
      console.error('[INVENTORY_ADJ] refused unbalanced JE for adj', adj.id, '—', e.message)
      return { posted: false, reason: e.message }
    }
    throw e
  }
}

/** Reverse a previously posted inventory adjustment JE. */
export async function reverseInventoryAdjustmentJournal(
  prisma: PrismaClient,
  adjustmentId: string,
  createdById: string,
  reason: string,
): Promise<PostInvAdjResult> {
  if (process.env.ENABLE_GL_POSTING !== 'true') {
    return { posted: false, reason: 'ENABLE_GL_POSTING flag is off' }
  }

  const original = await prisma.journalEntry.findFirst({
    where: { referenceType: { in: ['INVENTORY_INCREASE', 'INVENTORY_SHRINKAGE'] }, referenceId: adjustmentId },
    include: { lines: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!original) return { posted: false, reason: 'no original JE found to reverse' }

  const lines: PostingLine[] = original.lines.map(l => ({
    accountId: l.accountId,
    debit:  Number(l.credit) || 0,
    credit: Number(l.debit)  || 0,
    description: `Reversal — ${reason}`,
  }))

  try {
    const je = await postJournalEntry(prisma, {
      entryDate:     new Date(),
      description:   `Reversal of inventory adjustment ${adjustmentId} — ${reason}`,
      referenceType: 'INVENTORY_ADJUSTMENT_REVERSAL',
      referenceId:   adjustmentId,
      branch:        original.branch,
      createdById,
      lines,
    })
    return { posted: true, journalEntryId: je.id }
  } catch (e) {
    if (e instanceof UnbalancedJournalEntryError) {
      console.error('[INVENTORY_ADJ_REVERSAL] refused unbalanced JE for adj', adjustmentId, '—', e.message)
      return { posted: false, reason: e.message }
    }
    throw e
  }
}
