import type { Prisma } from '@prisma/client'
import { postJournalEntry } from '@/lib/accounting/posting'
import { branchForBankAccount } from '@/lib/branch'
import { netOfDeductions } from '@/lib/pos-settlement-shapes'

// Card and QR takings (credit card, debit, GCash, PayMaya) post to a clearing
// account (1170 Undeposited Funds) at the till. When the bank deposit that
// settles them is matched, this entry moves the money into the bank:
//
//   DR bank        exactly what the bank credited
//   DR 1140 CWT    what the acquirer withheld (0.5% of gross) — creditable tax
//   CR clearing    what the till parked there (gross less the MDR, per rate era)
//
// Deposits dated before SETTLEMENT_RECLASS_FROM were moved out of 1170 by the
// monthly in-transit true-ups (MJE "In-transit true-up …"), so they post
// nothing here: posting them again would move the same money twice.
export const SETTLEMENT_RECLASS_FROM = '2026-11-01' // Manila date of the bank line
export const CARD_QR_METHODS = ['CREDIT_CARD', 'DEBIT', 'GCASH', 'PAYMAYA']
const CWT_ACCOUNT_NUMBER = '1140' // Creditable Withholding Tax
// Acquirers withhold 1% of half the gross (0.5%). A gap up to 1% of gross is
// read as withholding; anything wider means the payments don't make up the deposit.
const MAX_WITHHOLDING_RATE = 0.01

const round2 = (n: number) => Math.round(n * 100) / 100
const manilaDay = (d: Date) => new Date(+d + 8 * 3600_000).toISOString().slice(0, 10)

export const reclassApplies = (bankLineDate: Date) => manilaDay(bankLineDate) >= SETTLEMENT_RECLASS_FROM

export class SettlementGapError extends Error {}

type Deduction = { rate: unknown; valueType: string; effectiveFrom?: Date | null; effectiveTo?: Date | null }
export type SettledPayment = {
  gross: number
  saleDate: Date
  clearingAccountId: string
  deductions: Deduction[]
}

// Posts the move for one matched deposit and returns the entry id. Throws
// SettlementGapError when the deposit and the payments don't agree, so the
// caller's transaction rolls back and nothing is half-matched.
export async function postSettlementReclass(tx: Prisma.TransactionClient, args: {
  batchId: string
  bankLine: { date: Date; bankAccountId: string; received: number }
  payments: SettledPayment[]
  label: string
  createdById: string
}): Promise<string> {
  const { batchId, bankLine, payments, label, createdById } = args
  const received = round2(bankLine.received)
  const gross = round2(payments.reduce((s, p) => s + p.gross, 0))
  const byClearing = new Map<string, number>()
  for (const p of payments) {
    const parked = netOfDeductions(p.gross, p.deductions as never, p.saleDate)
    byClearing.set(p.clearingAccountId, round2((byClearing.get(p.clearingAccountId) || 0) + parked))
  }
  const parkedTotal = round2([...byClearing.values()].reduce((s, v) => s + v, 0))
  const withheld = round2(parkedTotal - received)
  if (withheld < -0.05 || withheld > round2(gross * MAX_WITHHOLDING_RATE + 1)) {
    throw new SettlementGapError(
      `The deposit (₱${received.toFixed(2)}) doesn't match these payments: after card fees they come to ₱${parkedTotal.toFixed(2)}, ` +
      `a gap of ₱${Math.abs(withheld).toFixed(2)} — more than the acquirer's withholding. Pick the payments that make up this deposit.`)
  }

  const bankAcct = await tx.account.findUnique({ where: { id: bankLine.bankAccountId }, select: { accountTitle: true } })
  const lines: { accountId: string; debit?: number; credit?: number; description: string }[] = [
    { accountId: bankLine.bankAccountId, debit: received, description: 'Settled into bank' },
  ]
  if (Math.abs(withheld) >= 0.01) {
    const cwt = await tx.account.findFirst({ where: { accountNumber: CWT_ACCOUNT_NUMBER }, select: { id: true } })
    if (!cwt) throw new Error(`Account ${CWT_ACCOUNT_NUMBER} Creditable Withholding Tax not found`)
    lines.push(withheld > 0
      ? { accountId: cwt.id, debit: withheld, description: 'Withheld by the acquirer (creditable)' }
      : { accountId: cwt.id, credit: -withheld, description: 'Withholding rounding' })
  }
  for (const [accountId, amt] of byClearing) {
    if (amt > 0) lines.push({ accountId, credit: amt, description: 'Cleared from undeposited funds' })
  }

  const je = await postJournalEntry(tx, {
    entryDate: bankLine.date,
    description: `POS settlement reclass — ${label}`.slice(0, 500),
    referenceType: 'POS_SETTLEMENT_RECLASS',
    referenceId: batchId,
    branch: branchForBankAccount(bankAcct?.accountTitle),
    createdById,
    lines,
  })
  return je.id
}
