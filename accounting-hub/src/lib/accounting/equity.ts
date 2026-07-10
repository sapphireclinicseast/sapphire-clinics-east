import type { PrismaClient } from '@prisma/client'
import { postJournalEntry } from './posting'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PrismaClient | any

// Issuance: DR bank (money in) / CR the chosen equity account. Requires both accounts.
export async function postEquityIssuance(db: Db, opts: {
  kind: 'COMMON' | 'PREFERRED'; refId: string; date: Date; amount: number; bankAccountId?: string | null; equityAccountId?: string | null; investor: string; createdById: string
}): Promise<string | null> {
  if (!opts.bankAccountId || !opts.equityAccountId || !(opts.amount > 0)) return null
  const je = await postJournalEntry(db, {
    entryDate: opts.date,
    description: `${opts.kind === 'COMMON' ? 'Common' : 'Preferred'} share issuance — ${opts.investor}`,
    referenceType: opts.kind === 'COMMON' ? 'EQUITY_COMMON' : 'EQUITY_PREFERRED',
    referenceId: opts.refId,
    branch: 'ALL',
    createdById: opts.createdById,
    lines: [
      { accountId: opts.bankAccountId, debit: opts.amount, description: `Investment from ${opts.investor}` },
      { accountId: opts.equityAccountId, credit: opts.amount, description: `Share capital — ${opts.investor}` },
    ],
  })
  return je.id
}

// Buyback → Treasury: DR the chosen treasury/equity account / CR bank (money out).
export async function postEquityBuyback(db: Db, opts: {
  refId: string; date: Date; amount: number; bankAccountId?: string | null; treasuryAccountId?: string | null; investor: string; createdById: string
}): Promise<string | null> {
  if (!opts.bankAccountId || !opts.treasuryAccountId || !(opts.amount > 0)) return null
  const je = await postJournalEntry(db, {
    entryDate: opts.date,
    description: `Share buyback (treasury) — ${opts.investor}`,
    referenceType: 'EQUITY_BUYBACK',
    referenceId: opts.refId,
    branch: 'ALL',
    createdById: opts.createdById,
    lines: [
      { accountId: opts.treasuryAccountId, debit: opts.amount, description: `Treasury shares — ${opts.investor}` },
      { accountId: opts.bankAccountId, credit: opts.amount, description: `Paid buyback to ${opts.investor}` },
    ],
  })
  return je.id
}

// Dividend / preferred payout: DR the chosen Retained Earnings account / CR bank.
export async function postDividend(db: Db, opts: {
  refType: string; refId: string; date: Date; amount: number; bankAccountId?: string | null; retainedAccountId?: string | null; label: string; createdById: string
}): Promise<string | null> {
  if (!opts.bankAccountId || !opts.retainedAccountId || !(opts.amount > 0)) return null
  const je = await postJournalEntry(db, {
    entryDate: opts.date,
    description: opts.label,
    referenceType: opts.refType,
    referenceId: opts.refId,
    branch: 'ALL',
    createdById: opts.createdById,
    lines: [
      { accountId: opts.retainedAccountId, debit: opts.amount, description: opts.label },
      { accountId: opts.bankAccountId, credit: opts.amount, description: opts.label },
    ],
  })
  return je.id
}

// Scholarship monthly release: DR the chosen scholarship account / CR bank
// (money out). The DR account is configurable: an EQUITY "Scholarship Fund"
// (appropriated retained earnings) keeps it OFF the income statement, while an
// EXPENSE account would fold it into the P&L. The IS fold keys off account type.
export async function postScholarship(db: Db, opts: {
  refId: string; date: Date; amount: number; bankAccountId?: string | null; expenseAccountId?: string | null; label: string; createdById: string
}): Promise<string | null> {
  if (!opts.bankAccountId || !opts.expenseAccountId || !(opts.amount > 0)) return null
  const je = await postJournalEntry(db, {
    entryDate: opts.date,
    description: opts.label,
    referenceType: 'SCHOLAR_RELEASE',
    referenceId: opts.refId,
    branch: 'ALL',
    createdById: opts.createdById,
    lines: [
      { accountId: opts.expenseAccountId, debit: opts.amount, description: opts.label },
      { accountId: opts.bankAccountId, credit: opts.amount, description: opts.label },
    ],
  })
  return je.id
}

// Reverse any equity JE by referenceType+referenceId (for edits/deletes).
export async function reverseEquityJournal(db: Db, referenceType: string, referenceId: string) {
  await db.journalEntry.deleteMany({ where: { referenceType, referenceId } })
}
