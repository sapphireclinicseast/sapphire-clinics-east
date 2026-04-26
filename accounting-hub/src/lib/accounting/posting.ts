/**
 * Central posting service — Tier 3 Step 1.
 *
 * THE INVARIANT: For every business event in the system, the only way to
 * create a JournalEntry is through `postJournalEntry`. The service refuses
 * any payload where Σdebit ≠ Σcredit, so an unbalanced GL is impossible
 * by construction.
 *
 * Every module (POS, AR, payroll, inventory, assets, depreciation) must call
 * this helper rather than `prisma.journalEntry.create` directly. A future
 * pre-commit / lint rule should ban that direct call.
 *
 * The helper accepts an optional Prisma transaction client so it can be
 * composed inside a larger `prisma.$transaction([...])` — e.g. POS order
 * creation needs the order, items, payments, inventory deductions, AND
 * journal entry to all succeed or fail atomically.
 */

import type { Prisma, PrismaClient } from '@prisma/client'

export interface PostingLine {
  accountId: string
  debit?: number
  credit?: number
  description?: string
}

export interface PostingPayload {
  entryDate: Date
  description: string
  referenceType: string   // POS_ORDER, AR_PAYMENT, PAYROLL_*, ASSET_PURCHASE, DEPRECIATION, INVENTORY_PURCHASE, FREE_SAMPLE, CLOSING_ENTRY, etc.
  referenceId?: string
  branch?: string         // 'ALL' if not branch-scoped
  createdById: string
  lines: PostingLine[]
}

export class UnbalancedJournalEntryError extends Error {
  constructor(public readonly debitTotal: number, public readonly creditTotal: number, public readonly payload: PostingPayload) {
    super(`Unbalanced journal entry: DR ${debitTotal.toFixed(2)} ≠ CR ${creditTotal.toFixed(2)} (diff ${Math.abs(debitTotal - creditTotal).toFixed(2)}) for "${payload.description}" [${payload.referenceType}${payload.referenceId ? ':' + payload.referenceId : ''}]`)
    this.name = 'UnbalancedJournalEntryError'
  }
}

export class EmptyJournalEntryError extends Error {
  constructor(public readonly payload: PostingPayload) {
    super(`Empty journal entry: no lines for "${payload.description}" [${payload.referenceType}]`)
    this.name = 'EmptyJournalEntryError'
  }
}

/**
 * Tolerance for the DR/CR equality check. Decimal columns are stored at high
 * precision but POS amounts often involve % deductions (MDR, CWT) that round
 * to two places — sub-cent drift up to 0.005 is normal.
 */
const BALANCE_TOLERANCE = 0.005

/**
 * Tx alias accepting either the top-level PrismaClient or a transactional
 * client passed from `prisma.$transaction(...)`.
 */
type TxClient = PrismaClient | Prisma.TransactionClient

export async function postJournalEntry(tx: TxClient, payload: PostingPayload) {
  if (!payload.lines || payload.lines.length === 0) {
    throw new EmptyJournalEntryError(payload)
  }

  // Normalise: every line has a numeric debit and credit, never both > 0.
  const normalised = payload.lines.map((l, i) => {
    const debit  = Number(l.debit  || 0)
    const credit = Number(l.credit || 0)
    if (debit < 0 || credit < 0) {
      throw new Error(`Line ${i}: negative debit/credit not allowed (use the opposite side instead)`)
    }
    if (debit > 0 && credit > 0) {
      throw new Error(`Line ${i}: a single line cannot have both debit and credit`)
    }
    if (debit === 0 && credit === 0) {
      throw new Error(`Line ${i}: zero-amount line not allowed`)
    }
    if (!l.accountId) throw new Error(`Line ${i}: accountId is required`)
    return { accountId: l.accountId, debit, credit, description: l.description || null }
  })

  const debitTotal  = normalised.reduce((s, l) => s + l.debit,  0)
  const creditTotal = normalised.reduce((s, l) => s + l.credit, 0)

  if (Math.abs(debitTotal - creditTotal) > BALANCE_TOLERANCE) {
    throw new UnbalancedJournalEntryError(debitTotal, creditTotal, payload)
  }

  return tx.journalEntry.create({
    data: {
      entryDate:     payload.entryDate,
      description:   payload.description,
      referenceType: payload.referenceType,
      referenceId:   payload.referenceId || null,
      totalAmount:   debitTotal,    // store the absolute movement (= DR = CR)
      branch:        payload.branch || 'ALL',
      createdById:   payload.createdById,
      lines: { create: normalised },
    },
    include: { lines: true },
  })
}

/**
 * Convenience: post several entries in one DB transaction. Each entry is
 * independently balance-checked, but they share commit/rollback semantics.
 */
export async function postJournalEntries(prisma: PrismaClient, payloads: PostingPayload[]) {
  return prisma.$transaction(async (tx) => {
    const out = []
    for (const p of payloads) out.push(await postJournalEntry(tx, p))
    return out
  })
}
