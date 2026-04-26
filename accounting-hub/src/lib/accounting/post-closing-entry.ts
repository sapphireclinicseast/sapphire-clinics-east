/**
 * Tier 3 Step 10 — Closing entries.
 *
 * At year-end, post a single balanced JE that:
 *   - DRs every CR-natural REVENUE account by its YTD net credit  (zero them)
 *   - CRs every DR-natural REVENUE account by its YTD net debit   (zero them)
 *   - CRs every EXPENSE account by its YTD net debit              (zero them)
 *   - DRs/CRs Retained Earnings by the difference (= Net Income)
 *
 * Effect:
 *   After posting, all P&L accounts have zero balance for the year, and
 *   Retained Earnings has accumulated the NI. The next year opens clean.
 *
 * Idempotency: referenceType=CLOSING_ENTRY, referenceId=`${year}:${branch}`.
 *
 * This helper SKIPS journal lines whose entry already has referenceType
 * CLOSING_ENTRY or CLOSING_ENTRY_REVERSAL, so re-running on top of an existing
 * close is a no-op (and re-running after a reversal posts a fresh close).
 *
 * Gated by ENABLE_GL_POSTING.
 */

import type { PrismaClient } from '@prisma/client'
import { postJournalEntry, UnbalancedJournalEntryError, type PostingLine } from './posting'

export interface ClosingEntryResult {
  posted: boolean
  reason?: string
  journalEntryId?: string
  alreadyClosed?: boolean
  netIncome?: number
}

const refIdFor = (year: number, branch: string) => `${year}:${branch || 'ALL'}`

async function findRetainedEarningsAccount(prisma: PrismaClient) {
  // Try by sub-type first, then by name match.
  const bySub = await prisma.account.findFirst({
    where: { accountType: 'EQUITY', subType: 'RETAINED_EARNINGS' },
    select: { id: true, accountNumber: true, accountTitle: true },
  })
  if (bySub) return bySub
  return prisma.account.findFirst({
    where: { accountType: 'EQUITY', accountTitle: { contains: 'retained', mode: 'insensitive' } },
    select: { id: true, accountNumber: true, accountTitle: true },
  })
}

export async function postClosingEntry(
  prisma: PrismaClient,
  year: number,
  branch: string,
  createdById: string,
): Promise<ClosingEntryResult> {
  if (process.env.ENABLE_GL_POSTING !== 'true') {
    return { posted: false, reason: 'ENABLE_GL_POSTING flag is off' }
  }

  const refId = refIdFor(year, branch)

  // Idempotency: refuse to double-close.
  const existing = await prisma.journalEntry.findFirst({
    where: { referenceType: 'CLOSING_ENTRY', referenceId: refId },
    select: { id: true },
  })
  if (existing) return { posted: false, alreadyClosed: true, journalEntryId: existing.id }

  const startDate = new Date(Date.UTC(year, 0, 1))
  const endDate   = new Date(Date.UTC(year + 1, 0, 1))

  // Pull every JE line in the year, EXCLUDING any prior closing/reversal entries
  // (so we close the operating activity, not the balance transfers themselves).
  const lines = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: {
        entryDate: { gte: startDate, lt: endDate },
        ...(branch !== 'ALL' ? { branch } : {}),
        referenceType: { notIn: ['CLOSING_ENTRY', 'CLOSING_ENTRY_REVERSAL'] },
      },
    },
    select: {
      debit: true, credit: true,
      account: { select: { id: true, accountType: true, normalBalance: true } },
    },
  })

  const drByAcct = new Map<string, number>()
  const crByAcct = new Map<string, number>()
  const acctMeta = new Map<string, { type: string; normalBalance: 'DEBIT' | 'CREDIT' }>()
  for (const l of lines) {
    if (!l.account) continue
    if (l.account.accountType !== 'REVENUE' && l.account.accountType !== 'EXPENSE') continue
    drByAcct.set(l.account.id, (drByAcct.get(l.account.id) || 0) + Number(l.debit  || 0))
    crByAcct.set(l.account.id, (crByAcct.get(l.account.id) || 0) + Number(l.credit || 0))
    acctMeta.set(l.account.id, { type: l.account.accountType, normalBalance: l.account.normalBalance })
  }

  if (acctMeta.size === 0) {
    return { posted: false, reason: 'no Revenue or Expense activity in the period — nothing to close' }
  }

  const re = await findRetainedEarningsAccount(prisma)
  if (!re) return { posted: false, reason: 'no EQUITY > RETAINED_EARNINGS account configured' }

  // Build closing lines: each P&L account zeroed by its net balance.
  const closingLines: PostingLine[] = []
  let netIncome = 0  // NI = Σrevenue (CR-net) − Σdiscounts (DR-net) − Σexpenses (DR-net)

  for (const [accountId, meta] of acctMeta) {
    const dr = drByAcct.get(accountId) || 0
    const cr = crByAcct.get(accountId) || 0
    const netBal = meta.normalBalance === 'DEBIT' ? dr - cr : cr - dr
    if (Math.abs(netBal) < 0.005) continue   // already zero

    if (meta.normalBalance === 'CREDIT') {
      // CR-natural revenue: post DR netBal to zero it
      closingLines.push({ accountId, debit:  netBal, description: `Closing — zero credit balance` })
      netIncome += netBal
    } else {
      // DR-natural revenue (discount) or expense: post CR netBal to zero it
      closingLines.push({ accountId, credit: netBal, description: `Closing — zero debit balance` })
      netIncome -= netBal
    }
  }

  if (closingLines.length === 0) {
    return { posted: false, reason: 'all P&L accounts already at zero — nothing to close' }
  }

  // Balancing line: Retained Earnings.
  //   netIncome > 0 → CR Retained Earnings (equity ↑)
  //   netIncome < 0 → DR Retained Earnings (equity ↓)
  if (netIncome > 0) {
    closingLines.push({ accountId: re.id, credit:  netIncome, description: `Net Income for ${year} → Retained Earnings` })
  } else if (netIncome < 0) {
    closingLines.push({ accountId: re.id, debit:  -netIncome, description: `Net Loss for ${year} → Retained Earnings` })
  }

  // Date it on the last second of the year so it's the final entry of the period.
  const entryDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59))

  try {
    const je = await postJournalEntry(prisma, {
      entryDate,
      description:   `Closing entries — FY${year}${branch !== 'ALL' ? ' (' + branch + ')' : ''}`,
      referenceType: 'CLOSING_ENTRY',
      referenceId:   refId,
      branch,
      createdById,
      lines: closingLines,
    })
    return { posted: true, journalEntryId: je.id, netIncome }
  } catch (e) {
    if (e instanceof UnbalancedJournalEntryError) {
      console.error('[CLOSING_ENTRY] refused unbalanced JE for', refId, '—', e.message)
      return { posted: false, reason: e.message }
    }
    throw e
  }
}

/**
 * Re-open the books for a year by writing a contra-entry of the closing JE.
 * Idempotent: if a reversal already exists for the same year+branch, returns
 * { posted: false, reason: '...' } without writing again.
 */
export async function reverseClosingEntry(
  prisma: PrismaClient,
  year: number,
  branch: string,
  createdById: string,
  reason: string,
): Promise<ClosingEntryResult> {
  if (process.env.ENABLE_GL_POSTING !== 'true') {
    return { posted: false, reason: 'ENABLE_GL_POSTING flag is off' }
  }

  const refId = refIdFor(year, branch)

  const original = await prisma.journalEntry.findFirst({
    where: { referenceType: 'CLOSING_ENTRY', referenceId: refId },
    include: { lines: true },
  })
  if (!original) return { posted: false, reason: 'no closing entry found to reverse' }

  // If a reversal already exists, refuse to double-reverse.
  const existingReversal = await prisma.journalEntry.findFirst({
    where: { referenceType: 'CLOSING_ENTRY_REVERSAL', referenceId: refId },
    select: { id: true },
  })
  if (existingReversal) return { posted: false, reason: 'closing entry already reversed', journalEntryId: existingReversal.id }

  const lines: PostingLine[] = original.lines.map(l => ({
    accountId: l.accountId,
    debit:  Number(l.credit) || 0,
    credit: Number(l.debit)  || 0,
    description: `Reversal of closing — ${reason}`,
  }))

  try {
    const je = await postJournalEntry(prisma, {
      entryDate:     new Date(),
      description:   `Reopen books — FY${year}${branch !== 'ALL' ? ' (' + branch + ')' : ''} — ${reason}`,
      referenceType: 'CLOSING_ENTRY_REVERSAL',
      referenceId:   refId,
      branch,
      createdById,
      lines,
    })
    return { posted: true, journalEntryId: je.id }
  } catch (e) {
    if (e instanceof UnbalancedJournalEntryError) {
      console.error('[CLOSING_ENTRY_REVERSAL] refused unbalanced JE for', refId, '—', e.message)
      return { posted: false, reason: e.message }
    }
    throw e
  }
}
