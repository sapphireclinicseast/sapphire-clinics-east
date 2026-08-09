/**
 * Landed-cost restatement — the COGS half of a late cost correction.
 *
 * When a stock lot's landed cost changes AFTER some of its units have been
 * sold (the freight bill arrives weeks after the shipment, an exchange rate is
 * corrected, a manufacturer price is fixed), the units still on hand are
 * re-valued for free: rewriting the lot's cost and recalculating the item's
 * weighted-average unit cost moves them on the balance sheet.
 *
 * The units already sold cannot be re-valued that way. Their cost of sales was
 * recognised at the old figure and that sale is closed. The difference on those
 * units is a period cost — it belongs in Cost of Sales now, and it must leave
 * Inventory, which is currently carrying value for units that no longer exist:
 *
 *   cost went UP    DR Cost of Sales   CR Inventory
 *   cost went DOWN  DR Inventory       CR Cost of Sales
 *
 * This mirrors the COGS pair in post-order.ts — each item's own expense (COGS)
 * and inventory (ASSET) accounts, falling back to 1010 Inventory — so the
 * restatement lands in the same accounts the original sale used. One entry per
 * branch, since a journal entry is branch-scoped.
 */

import type { Prisma, PrismaClient } from '@prisma/client'
import { postJournalEntry, UnbalancedJournalEntryError } from './posting'

type TxClient = PrismaClient | Prisma.TransactionClient

/** One lot whose per-unit cost moved, and how many of its units were already sold. */
export interface SoldUnitCostChange {
  itemId: string
  soldUnits: number
  oldUnitCost: number
  newUnitCost: number
}

export interface RestatementResult {
  posted: boolean
  reason?: string
  journalEntryIds: string[]
  /** Net PHP moved into Cost of Sales (negative = moved back into Inventory). */
  totalDelta: number
}

/** Cost changes worth a journal entry — anything under half a centavo is noise. */
const MATERIALITY = 0.005

export async function postSoldCostRestatement(
  tx: TxClient,
  opts: {
    changes: SoldUnitCostChange[]
    entryDate: Date
    createdById: string
    referenceType: string
    referenceId?: string
    description: string
  },
): Promise<RestatementResult> {
  // Net every lot's movement down to one figure per item.
  const deltaByItem = new Map<string, number>()
  for (const c of opts.changes) {
    if (!(c.soldUnits > 0)) continue
    const delta = (c.newUnitCost - c.oldUnitCost) * c.soldUnits
    if (!Number.isFinite(delta)) continue
    deltaByItem.set(c.itemId, (deltaByItem.get(c.itemId) || 0) + delta)
  }
  for (const [itemId, d] of deltaByItem) {
    const rounded = Math.round(d * 100) / 100
    if (Math.abs(rounded) < MATERIALITY) deltaByItem.delete(itemId)
    else deltaByItem.set(itemId, rounded)
  }
  if (deltaByItem.size === 0) {
    return { posted: false, reason: 'no cost change on units already sold', journalEntryIds: [], totalDelta: 0 }
  }

  const items = await tx.inventoryItem.findMany({
    where: { id: { in: [...deltaByItem.keys()] } },
    select: {
      id: true, name: true, branch: true,
      expenseAccount: { select: { id: true } },
      sourceAccount: { select: { id: true, accountType: true } },
    },
  })
  const defaultInventoryAccount = await tx.account.findFirst({
    where: { accountNumber: '1010', accountType: 'ASSET' },
    select: { id: true },
  })

  // Group into one entry per branch — a JournalEntry carries a single branch.
  const byBranch = new Map<string, { accountId: string; debit?: number; credit?: number; description: string }[]>()
  let totalDelta = 0

  for (const item of items) {
    const delta = deltaByItem.get(item.id) || 0
    const cogsAcct = item.expenseAccount
    const invAcct = item.sourceAccount?.accountType === 'ASSET' ? item.sourceAccount : defaultInventoryAccount
    if (!cogsAcct || !invAcct) {
      return {
        posted: false,
        reason: `inventory item "${item.name}" is missing a COGS account or an inventory ASSET account`,
        journalEntryIds: [],
        totalDelta: 0,
      }
    }
    const amount = Math.abs(delta)
    const note = delta > 0 ? 'Landed-cost increase on units already sold' : 'Landed-cost decrease on units already sold'
    const lines = byBranch.get(item.branch) || []
    lines.push(
      delta > 0
        ? { accountId: cogsAcct.id, debit: amount, description: `${note} — ${item.name}` }
        : { accountId: invAcct.id, debit: amount, description: `${note} — ${item.name}` },
      delta > 0
        ? { accountId: invAcct.id, credit: amount, description: `Inventory write-down — ${item.name}` }
        : { accountId: cogsAcct.id, credit: amount, description: `Cost of sales reversal — ${item.name}` },
    )
    byBranch.set(item.branch, lines)
    totalDelta += delta
  }

  const journalEntryIds: string[] = []
  try {
    for (const [branch, lines] of byBranch) {
      const je = await postJournalEntry(tx, {
        entryDate: opts.entryDate,
        description: opts.description,
        referenceType: opts.referenceType,
        referenceId: opts.referenceId,
        branch,
        createdById: opts.createdById,
        lines,
      })
      journalEntryIds.push(je.id)
    }
  } catch (e) {
    if (e instanceof UnbalancedJournalEntryError) {
      console.error('[COST_RESTATEMENT] refused unbalanced JE —', e.message)
      return { posted: false, reason: e.message, journalEntryIds, totalDelta: 0 }
    }
    throw e
  }

  return { posted: true, journalEntryIds, totalDelta: Math.round(totalDelta * 100) / 100 }
}
