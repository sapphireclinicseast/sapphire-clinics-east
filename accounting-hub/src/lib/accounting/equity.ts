import type { PrismaClient } from '@prisma/client'
import { postJournalEntry } from './posting'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PrismaClient | any

// Resolve (or create) an equity COA account by number, so posting always has a target.
async function ensureAccount(db: Db, accountNumber: string, accountTitle: string, normalBalance: 'DEBIT' | 'CREDIT', createdById: string) {
  const existing = await db.account.findFirst({ where: { accountNumber } })
  if (existing) return existing
  return db.account.create({
    data: { accountNumber, accountTitle, accountType: 'EQUITY', subType: 'PAID_IN_CAPITAL', normalBalance, createdById },
  })
}

export const EQUITY_ACCOUNTS = {
  COMMON: { number: '3200', title: 'Common Share Capital', normal: 'CREDIT' as const },
  PREFERRED: { number: '3300', title: 'Preferred Share Capital', normal: 'CREDIT' as const },
  TREASURY: { number: '3400', title: 'Treasury Shares', normal: 'DEBIT' as const },
  RETAINED: { number: '3100', title: 'Retained Earnings', normal: 'CREDIT' as const },
}

// Issuance: DR bank (money in) / CR share capital. Returns the JE id, or null if no bank/amount.
export async function postEquityIssuance(db: Db, opts: {
  kind: 'COMMON' | 'PREFERRED'; refId: string; date: Date; amount: number; bankAccountId?: string | null; investor: string; createdById: string
}): Promise<string | null> {
  if (!opts.bankAccountId || !(opts.amount > 0)) return null
  const capital = opts.kind === 'COMMON' ? EQUITY_ACCOUNTS.COMMON : EQUITY_ACCOUNTS.PREFERRED
  const capAcct = await ensureAccount(db, capital.number, capital.title, 'CREDIT', opts.createdById)
  const je = await postJournalEntry(db, {
    entryDate: opts.date,
    description: `${opts.kind === 'COMMON' ? 'Common' : 'Preferred'} share issuance — ${opts.investor}`,
    referenceType: opts.kind === 'COMMON' ? 'EQUITY_COMMON' : 'EQUITY_PREFERRED',
    referenceId: opts.refId,
    branch: 'ALL',
    createdById: opts.createdById,
    lines: [
      { accountId: opts.bankAccountId, debit: opts.amount, description: `Investment from ${opts.investor}` },
      { accountId: capAcct.id, credit: opts.amount, description: `${capital.title} — ${opts.investor}` },
    ],
  })
  return je.id
}

// Buyback → Treasury: DR Treasury Shares / CR bank (money out).
export async function postEquityBuyback(db: Db, opts: {
  refId: string; date: Date; amount: number; bankAccountId?: string | null; investor: string; createdById: string
}): Promise<string | null> {
  if (!opts.bankAccountId || !(opts.amount > 0)) return null
  const treasury = await ensureAccount(db, EQUITY_ACCOUNTS.TREASURY.number, EQUITY_ACCOUNTS.TREASURY.title, 'DEBIT', opts.createdById)
  const je = await postJournalEntry(db, {
    entryDate: opts.date,
    description: `Share buyback (treasury) — ${opts.investor}`,
    referenceType: 'EQUITY_BUYBACK',
    referenceId: opts.refId,
    branch: 'ALL',
    createdById: opts.createdById,
    lines: [
      { accountId: treasury.id, debit: opts.amount, description: `Treasury shares — ${opts.investor}` },
      { accountId: opts.bankAccountId, credit: opts.amount, description: `Paid buyback to ${opts.investor}` },
    ],
  })
  return je.id
}

// Dividend / preferred payout: DR Retained Earnings / CR bank.
export async function postDividend(db: Db, opts: {
  refType: string; refId: string; date: Date; amount: number; bankAccountId?: string | null; label: string; createdById: string
}): Promise<string | null> {
  if (!opts.bankAccountId || !(opts.amount > 0)) return null
  const re = await ensureAccount(db, EQUITY_ACCOUNTS.RETAINED.number, EQUITY_ACCOUNTS.RETAINED.title, 'CREDIT', opts.createdById)
  const je = await postJournalEntry(db, {
    entryDate: opts.date,
    description: opts.label,
    referenceType: opts.refType,
    referenceId: opts.refId,
    branch: 'ALL',
    createdById: opts.createdById,
    lines: [
      { accountId: re.id, debit: opts.amount, description: opts.label },
      { accountId: opts.bankAccountId, credit: opts.amount, description: opts.label },
    ],
  })
  return je.id
}

// Reverse any equity JE by referenceType+referenceId (for edits/deletes).
export async function reverseEquityJournal(db: Db, referenceType: string, referenceId: string) {
  await db.journalEntry.deleteMany({ where: { referenceType, referenceId } })
}
