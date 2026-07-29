/**
 * Subsidiary Ledger — per-account transaction breakdown.
 *
 * Where the Trial Balance answers "what is the balance of every account?", the
 * subsidiary ledger answers "which transactions make up that balance?". For a
 * date range and an optional account-type / account / branch filter it returns,
 * for every matching COA account:
 *
 *   opening balance  →  every posting in the range  →  closing balance
 *
 * Each posting carries the counter-account(s) of its journal entry (the "split"),
 * so an accountant can read a line and see both sides without opening the JE.
 *
 * Opening-balance convention deliberately mirrors `computeTrialBalance`'s "asOf"
 * form: BeginningBalance of the year the range starts in, plus every posting
 * dated before the range. That makes `opening` for a range starting on D equal
 * to the trial balance as of D-1, so the two reports can never disagree.
 *
 * Totals (opening / DR / CR / closing / line count) are computed with groupBy
 * over the whole matching set, so they stay exact even when the detail lines are
 * capped by `limit` for a very wide range.
 */

import type { PrismaClient } from '@prisma/client'

export interface LedgerLine {
  id: string
  journalEntryId: string
  date: string            // ISO — the journal entry date
  refType: string         // raw referenceType, e.g. POS_ORDER
  refId: string | null    // "Num" column
  branch: string
  /** Line memo, falling back to the journal entry description. */
  description: string
  /** The journal entry description (the "Name" the posting was booked under). */
  entryDescription: string
  /** Counter-account(s): a single account title, or '— Split —' when several. */
  split: string
  /** The other side(s) of the journal entry — powers the entry drill-down. */
  splitLines: { account: string; debit: number; credit: number }[]
  debit: number
  credit: number
  /** Running balance in the account's normal direction (+ = more of normal side). */
  balance: number
}

export interface LedgerAccount {
  accountId: string
  accountNumber: string
  accountTitle: string
  accountType: string
  subType: string | null
  normalBalance: 'DEBIT' | 'CREDIT'
  isActive: boolean
  opening: number
  debitTotal: number
  creditTotal: number
  /** Closing balance in the account's normal direction. */
  closing: number
  lines: LedgerLine[]
  /** Exact number of postings in range — may exceed `lines.length` when capped. */
  lineCount: number
  truncated: boolean
}

export interface SubsidiaryLedger {
  range: { from: string; to: string }
  branch: string
  accounts: LedgerAccount[]
  totals: { opening: number; debit: number; credit: number; closing: number; lineCount: number }
  /** True when the detail lines hit `limit` — totals are still exact. */
  truncated: boolean
  limit: number
}

export interface SubsidiaryLedgerOptions {
  from: Date
  to: Date                     // exclusive upper bound
  branch?: string              // 'ALL' or a Branch enum value
  accountType?: string         // 'ALL' | ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE
  accountIds?: string[]        // restrict to specific accounts
  refType?: string             // restrict to one transaction type
  search?: string              // matches account number/title, memo, description or reference
  includeInactive?: boolean    // include deactivated COA accounts (default false)
  /** Show accounts with no opening balance and no movement (default false). */
  includeEmpty?: boolean
  limit?: number               // detail-line cap (default 5000)
}

const DEFAULT_LIMIT = 5000
export const MAX_LIMIT = 20000

/** Human labels for JournalEntry.referenceType (the "Transaction Type" column). */
export const REF_TYPE_LABEL: Record<string, string> = {
  ADVANCE:                       'Advance',
  AR_PAYMENT:                    'AR Payment',
  AR_PAYMENT_REVERSAL:           'AR Payment Reversal',
  ASSET_PURCHASE:                'Asset Purchase',
  ASSET_PURCHASE_REVERSAL:       'Asset Purchase Reversal',
  BANK_REC:                      'Bank Reconciliation',
  BENEFIT_PAYMENT:               'Benefit Payment',
  CASH_ADVANCE:                  'Cash Advance',
  CLOSING_ENTRY:                 'Closing Entry',
  CLOSING_ENTRY_REVERSAL:        'Closing Entry Reversal',
  CREDIT_LINE_SETTLE:            'Credit Line Settlement',
  DEPRECIATION:                  'Depreciation',
  EQUITY_BUYBACK:                'Equity Buyback',
  EWT_OTHER_INCOME:              'EWT — Other Income',
  FREE_SAMPLE:                   'Free Sample',
  INVENTORY_ADJUSTMENT:          'Inventory Adjustment',
  INVENTORY_ADJUSTMENT_REVERSAL: 'Inventory Adj. Reversal',
  LOAN:                          'Loan',
  PAYMONGO_FEE:                  'PayMongo Fee',
  PAYMONGO_PAYOUT:               'PayMongo Payout',
  PAYMONGO_SALE:                 'PayMongo Sale',
  PAYROLL_CONSULTANT:            'Payroll — Consultant',
  PAYROLL_EMPLOYEE:              'Payroll — Employee',
  POS_ORDER:                     'POS Order',
  REFUND_PAYMENT:                'Refund',
  SALARY_PAYMENT:                'Salary Payment',
  SCHOLAR_RELEASE:               'Scholarship Release',
  TAX_OTHER_INCOME:              'Tax — Other Income',
  TAX_PAYMENT:                   'Tax Payment',
  TIKTOK_SETTLEMENT:             'TikTok Settlement',
  TIKTOK_WHT:                    'TikTok Withholding',
}

export function refTypeLabel(t: string): string {
  return REF_TYPE_LABEL[t] || t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export async function computeSubsidiaryLedger(
  prisma: PrismaClient,
  opts: SubsidiaryLedgerOptions,
): Promise<SubsidiaryLedger> {
  const {
    from, to,
    branch = 'ALL',
    accountType = 'ALL',
    accountIds,
    refType,
    search,
    includeInactive = false,
    includeEmpty = false,
  } = opts
  const limit = Math.min(Math.max(opts.limit || DEFAULT_LIMIT, 1), MAX_LIMIT)

  const term = (search || '').trim()

  // ── 1. Resolve the account set ────────────────────────────────────────────
  const accounts = await prisma.account.findMany({
    where: {
      ...(includeInactive ? {} : { isActive: true }),
      ...(accountType && accountType !== 'ALL'
        ? { accountType: accountType as 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE' }
        : {}),
      ...(accountIds && accountIds.length ? { id: { in: accountIds } } : {}),
    },
    select: {
      id: true, accountNumber: true, accountTitle: true, accountType: true,
      subType: true, normalBalance: true, isActive: true,
      beginningBalances: { select: { periodYear: true, amount: true } },
    },
    orderBy: { accountNumber: 'asc' },
  })
  if (accounts.length === 0) {
    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      branch, accounts: [],
      totals: { opening: 0, debit: 0, credit: 0, closing: 0, lineCount: 0 },
      truncated: false, limit,
    }
  }
  const ids = accounts.map(a => a.id)

  // A search term may target the account itself (number/title) rather than a
  // posting. When it does, narrow to those accounts and drop the line-level
  // text filter, so "1000 Cash" shows the whole Cash ledger rather than nothing.
  const accountMatches = term
    ? accounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(term.toLowerCase()))
    : []
  const searchTargetsAccount = term.length > 0 && accountMatches.length > 0
  const scopedIds = searchTargetsAccount ? accountMatches.map(a => a.id) : ids

  const jeWhere = {
    entryDate: { gte: from, lt: to },
    ...(branch !== 'ALL' ? { branch } : {}),
    ...(refType ? { referenceType: refType } : {}),
  }

  const lineWhere = {
    accountId: { in: scopedIds },
    journalEntry: jeWhere,
    ...(term && !searchTargetsAccount
      ? {
          OR: [
            { description: { contains: term, mode: 'insensitive' as const } },
            { journalEntry: { ...jeWhere, description: { contains: term, mode: 'insensitive' as const } } },
            { journalEntry: { ...jeWhere, referenceId: { contains: term, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  // ── 2. Exact per-account totals (independent of the detail-line cap) ──────
  const [periodTotals, priorTotals, detail] = await Promise.all([
    prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: lineWhere,
      _sum: { debit: true, credit: true },
      _count: { _all: true },
    }),
    prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: scopedIds },
        journalEntry: {
          entryDate: { lt: from },
          ...(branch !== 'ALL' ? { branch } : {}),
        },
      },
      _sum: { debit: true, credit: true },
    }),
    prisma.journalEntryLine.findMany({
      where: lineWhere,
      select: {
        id: true, accountId: true, debit: true, credit: true, description: true,
        journalEntry: {
          select: {
            id: true, entryDate: true, description: true,
            referenceType: true, referenceId: true, branch: true,
            lines: {
              select: {
                accountId: true, debit: true, credit: true,
                account: { select: { accountNumber: true, accountTitle: true } },
              },
            },
          },
        },
      },
      orderBy: [{ journalEntry: { entryDate: 'asc' } }, { journalEntryId: 'asc' }, { id: 'asc' }],
      take: limit,
    }),
  ])

  const periodByAcct = new Map(periodTotals.map(t => [t.accountId, t]))
  const priorByAcct  = new Map(priorTotals.map(t => [t.accountId, t]))

  // ── 3. Group the detail lines per account, in date order ──────────────────
  const linesByAcct = new Map<string, typeof detail>()
  for (const l of detail) {
    const bucket = linesByAcct.get(l.accountId)
    if (bucket) bucket.push(l)
    else linesByAcct.set(l.accountId, [l])
  }

  const fromYear = from.getUTCFullYear()
  const out: LedgerAccount[] = []
  let tOpening = 0, tDebit = 0, tCredit = 0, tClosing = 0, tCount = 0

  for (const a of accounts) {
    if (searchTargetsAccount && !scopedIds.includes(a.id)) continue

    const period = periodByAcct.get(a.id)
    const prior  = priorByAcct.get(a.id)

    const dr = Number(period?._sum.debit  || 0)
    const cr = Number(period?._sum.credit || 0)
    const lineCount = period?._count._all || 0

    const bb = a.beginningBalances.find(b => b.periodYear === fromYear)
    const priorDr = Number(prior?._sum.debit  || 0)
    const priorCr = Number(prior?._sum.credit || 0)
    const signedPrior = a.normalBalance === 'DEBIT' ? priorDr - priorCr : priorCr - priorDr
    const opening = Number(bb?.amount || 0) + signedPrior

    if (!includeEmpty && opening === 0 && lineCount === 0) continue

    // Running balance walks the postings in the account's normal direction.
    let running = opening
    const lines: LedgerLine[] = (linesByAcct.get(a.id) || []).map(l => {
      const debit  = Number(l.debit  || 0)
      const credit = Number(l.credit || 0)
      running += a.normalBalance === 'DEBIT' ? debit - credit : credit - debit
      const splitLines = l.journalEntry.lines
        .filter(x => x.accountId !== a.id)
        .map(x => ({
          account: `${x.account.accountNumber} ${x.account.accountTitle}`,
          debit: Number(x.debit || 0),
          credit: Number(x.credit || 0),
        }))
      const splitAccounts = Array.from(new Set(splitLines.map(x => x.account)))
      return {
        id: l.id,
        journalEntryId: l.journalEntry.id,
        date: l.journalEntry.entryDate.toISOString(),
        refType: l.journalEntry.referenceType,
        refId: l.journalEntry.referenceId,
        branch: l.journalEntry.branch,
        description: l.description || l.journalEntry.description,
        entryDescription: l.journalEntry.description,
        split: splitAccounts.length === 0 ? '—'
          : splitAccounts.length === 1 ? splitAccounts[0]
          : '— Split —',
        splitLines,
        debit, credit,
        balance: running,
      }
    })

    const closing = a.normalBalance === 'DEBIT'
      ? opening + dr - cr
      : opening + cr - dr

    out.push({
      accountId: a.id,
      accountNumber: a.accountNumber,
      accountTitle: a.accountTitle,
      accountType: a.accountType,
      subType: a.subType,
      normalBalance: a.normalBalance,
      isActive: a.isActive,
      opening, debitTotal: dr, creditTotal: cr, closing,
      lines,
      lineCount,
      truncated: lines.length < lineCount,
    })

    tOpening += opening
    tDebit   += dr
    tCredit  += cr
    tClosing += closing
    tCount   += lineCount
  }

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    branch,
    accounts: out,
    totals: { opening: tOpening, debit: tDebit, credit: tCredit, closing: tClosing, lineCount: tCount },
    truncated: detail.length >= limit,
    limit,
  }
}
