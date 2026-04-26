/**
 * Tier 3 Step 8 — Trial Balance.
 *
 * For a chosen point-in-time (asOf) OR a period (from..to), this helper:
 *   1. Sums every JournalEntryLine's debit/credit per account.
 *   2. Adds opening balances (BeginningBalance) for any "asOf" view.
 *   3. Returns per-account totals + grand totals + a boolean "balanced" flag.
 *
 * The balanced flag is the safety net for the entire Tier-3 design:
 *   - Every JE is balance-checked at write time by `postJournalEntry`.
 *   - Therefore the trial balance MUST be balanced for every period.
 *   - If it isn't, something has been written outside the posting service —
 *     a bug to be fixed, not data to be plugged.
 *
 * Used by:
 *   - GET /api/trial-balance — sanity check / drill-down for accountants.
 *   - The upcoming /api/reports/v2 — derives BS / IS / CF straight from the
 *     trial balance, with no ad-hoc derivation.
 */

import type { PrismaClient } from '@prisma/client'

export interface TrialBalanceLine {
  accountId: string
  accountNumber: string
  accountTitle: string
  accountType: string
  subType: string | null
  normalBalance: 'DEBIT' | 'CREDIT'
  opening: number          // signed by normalBalance: + means more of normal side
  debitTotal: number       // sum of period DR lines
  creditTotal: number      // sum of period CR lines
  /** Closing balance signed by normalBalance: + means more of normal side. */
  balance: number
}

export interface TrialBalance {
  range:    { type: 'asOf' | 'period'; asOf?: string; from?: string; to?: string }
  branch:   string
  lines:    TrialBalanceLine[]
  totals:   { openingDR: number; openingCR: number; periodDR: number; periodCR: number; closingDR: number; closingCR: number }
  balanced: boolean
  diff:     number
}

export interface TrialBalanceOptions {
  asOf?: Date          // cumulative balance through this date (inclusive)
  from?: Date          // period start (inclusive)
  to?: Date            // period end   (exclusive)
  branch?: string      // 'ALL' or branch enum value
  includeZeroLines?: boolean
}

const TOLERANCE = 0.01   // 1 centavo — multi-line orders with %-deductions can drift sub-cent

export async function computeTrialBalance(
  prisma: PrismaClient,
  opts: TrialBalanceOptions = {},
): Promise<TrialBalance> {
  const { asOf, from, to, branch = 'ALL', includeZeroLines = false } = opts

  // Determine date predicate
  const dateFilter: { lt?: Date; gte?: Date; lte?: Date } = {}
  if (asOf) dateFilter.lte = asOf
  if (from) dateFilter.gte = from
  if (to)   dateFilter.lt  = to

  const [accounts, lines] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      select: { id: true, accountNumber: true, accountTitle: true, accountType: true, subType: true, normalBalance: true,
        beginningBalances: { select: { periodYear: true, amount: true } },
      },
      orderBy: { accountNumber: 'asc' },
    }),
    prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          ...(Object.keys(dateFilter).length ? { entryDate: dateFilter } : {}),
          ...(branch !== 'ALL' ? { branch } : {}),
        },
      },
      select: {
        accountId: true, debit: true, credit: true,
      },
    }),
  ])

  // Aggregate per-account totals
  const drByAcct = new Map<string, number>()
  const crByAcct = new Map<string, number>()
  for (const l of lines) {
    drByAcct.set(l.accountId, (drByAcct.get(l.accountId) || 0) + Number(l.debit  || 0))
    crByAcct.set(l.accountId, (crByAcct.get(l.accountId) || 0) + Number(l.credit || 0))
  }

  // Pick the "opening year" relevant for this view:
  //   asOf     → most recent year ≤ asOf.getFullYear()
  //   period   → from.getFullYear() (if provided) else "no opening" (period view)
  const openingYear = asOf
    ? asOf.getUTCFullYear()
    : from
      ? from.getUTCFullYear()
      : null

  const tbLines: TrialBalanceLine[] = []
  let openingDR = 0, openingCR = 0
  let periodDR  = 0, periodCR  = 0
  let closingDR = 0, closingCR = 0

  for (const a of accounts) {
    const dr = drByAcct.get(a.id) || 0
    const cr = crByAcct.get(a.id) || 0

    let opening = 0
    if (openingYear !== null) {
      const ob = a.beginningBalances.find(b => b.periodYear === openingYear)
      if (ob) opening = Number(ob.amount)
    }

    // Per-account net balance, expressed in the account's normal direction.
    //   normalBalance=DEBIT  → balance = opening + DR − CR
    //   normalBalance=CREDIT → balance = opening + CR − DR
    const balance = a.normalBalance === 'DEBIT'
      ? opening + dr - cr
      : opening + cr - dr

    if (!includeZeroLines && opening === 0 && dr === 0 && cr === 0) continue

    tbLines.push({
      accountId:     a.id,
      accountNumber: a.accountNumber,
      accountTitle:  a.accountTitle,
      accountType:   a.accountType,
      subType:       a.subType,
      normalBalance: a.normalBalance,
      opening, debitTotal: dr, creditTotal: cr, balance,
    })

    if (a.normalBalance === 'DEBIT') openingDR += opening
    else                              openingCR += opening
    periodDR += dr
    periodCR += cr

    // Closing side: positive balances on the normal side go to that side; if
    // negative (overdraft / credit balance on a debit-normal account etc.) it
    // flips. This mirrors the standard trial-balance presentation.
    if (balance >= 0) {
      if (a.normalBalance === 'DEBIT') closingDR += balance
      else                              closingCR += balance
    } else {
      if (a.normalBalance === 'DEBIT') closingCR += -balance
      else                              closingDR += -balance
    }
  }

  const closingDiff = closingDR - closingCR
  return {
    range: asOf
      ? { type: 'asOf', asOf: asOf.toISOString() }
      : { type: 'period',
          from: from?.toISOString(),
          to:   to?.toISOString() },
    branch,
    lines: tbLines,
    totals: { openingDR, openingCR, periodDR, periodCR, closingDR, closingCR },
    balanced: Math.abs(closingDiff) < TOLERANCE,
    diff: closingDiff,
  }
}
