/**
 * Tier 3 Step 7 — Monthly depreciation auto-posting.
 *
 *   For each asset, for each month from dateBought through depreciationEndDate:
 *     DR 8070 Depreciation Expense       asset.monthlyDepreciation
 *       CR 2010 Accumulated Depreciation  asset.monthlyDepreciation
 *
 * Idempotent: every JE uses referenceType=DEPRECIATION and
 *             referenceId=<assetId>:<YYYY-MM>.
 * Re-running the same month is a no-op.
 *
 * Gated by ENABLE_GL_POSTING.
 */

import type { PrismaClient } from '@prisma/client'
import { postJournalEntry, UnbalancedJournalEntryError, type PostingLine } from './posting'

export interface PostDepResult {
  posted: boolean
  reason?: string
  journalEntryId?: string
  alreadyPosted?: boolean
}

const DEP_EXPENSE_NUMBERS = ['8070']  // 8070 Depreciation Expense (preferred)
const ACCUM_DEP_NUMBERS   = ['2010']  // 2010 Accumulated Depreciation (preferred)

async function findDepreciationExpenseAccount(prisma: PrismaClient) {
  const byNumber = await prisma.account.findFirst({
    where: { accountNumber: { in: DEP_EXPENSE_NUMBERS }, accountType: 'EXPENSE' },
    select: { id: true, accountNumber: true, accountTitle: true },
  })
  if (byNumber) return byNumber
  return prisma.account.findFirst({
    where: { accountType: 'EXPENSE', accountTitle: { contains: 'depreciation', mode: 'insensitive' } },
    select: { id: true, accountNumber: true, accountTitle: true },
  })
}

async function findAccumulatedDepreciationAccount(prisma: PrismaClient) {
  const byNumber = await prisma.account.findFirst({
    where: { accountNumber: { in: ACCUM_DEP_NUMBERS }, accountType: 'ASSET' },
    select: { id: true, accountNumber: true, accountTitle: true },
  })
  if (byNumber) return byNumber
  return prisma.account.findFirst({
    where: { accountType: 'ASSET', accountTitle: { contains: 'accumulated', mode: 'insensitive' } },
    select: { id: true, accountNumber: true, accountTitle: true },
  })
}

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`
const refIdFor = (assetId: string, year: number, month: number) => `${assetId}:${monthKey(year, month)}`

/**
 * Post one month of depreciation for one asset. Idempotent.
 *
 * @param month 1-12
 */
export async function postMonthlyDepreciation(
  prisma: PrismaClient,
  assetId: string,
  year: number,
  month: number,
  createdById: string,
): Promise<PostDepResult> {
  if (process.env.ENABLE_GL_POSTING !== 'true') {
    return { posted: false, reason: 'ENABLE_GL_POSTING flag is off' }
  }

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, name: true, branch: true, dateBought: true, depreciationEndDate: true, monthlyDepreciation: true },
  })
  if (!asset) return { posted: false, reason: 'asset not found' }

  const monthStart = new Date(Date.UTC(year, month - 1, 1))
  const monthEnd   = new Date(Date.UTC(year, month, 1))

  if (asset.dateBought >= monthEnd) return { posted: false, reason: 'asset purchased after this month' }
  if (asset.depreciationEndDate <= monthStart) return { posted: false, reason: 'asset fully depreciated before this month' }

  const amount = Number(asset.monthlyDepreciation)
  if (amount <= 0) return { posted: false, reason: 'monthlyDepreciation is zero' }

  // Idempotency
  const refId = refIdFor(asset.id, year, month)
  const existing = await prisma.journalEntry.findFirst({
    where: { referenceType: 'DEPRECIATION', referenceId: refId },
    select: { id: true },
  })
  if (existing) return { posted: false, alreadyPosted: true, journalEntryId: existing.id }

  const [depExp, accumDep] = await Promise.all([
    findDepreciationExpenseAccount(prisma),
    findAccumulatedDepreciationAccount(prisma),
  ])
  if (!depExp)   return { posted: false, reason: 'no Depreciation Expense (8070) account configured' }
  if (!accumDep) return { posted: false, reason: 'no Accumulated Depreciation (2010) account configured' }

  // Post on the last day of the month so it lands in the right reporting period.
  const entryDate = new Date(Date.UTC(year, month, 0, 23, 59, 59))

  const lines: PostingLine[] = [
    { accountId: depExp.id,   debit:  amount, description: `Depreciation — ${asset.name} (${monthKey(year, month)})` },
    { accountId: accumDep.id, credit: amount, description: `Accumulated depreciation — ${asset.name}` },
  ]

  try {
    const je = await postJournalEntry(prisma, {
      entryDate,
      description:   `Depreciation — ${asset.name} (${monthKey(year, month)})`,
      referenceType: 'DEPRECIATION',
      referenceId:   refId,
      branch:        asset.branch,
      createdById,
      lines,
    })
    return { posted: true, journalEntryId: je.id }
  } catch (e) {
    if (e instanceof UnbalancedJournalEntryError) {
      console.error('[DEPRECIATION] refused unbalanced JE for asset', asset.id, '—', e.message)
      return { posted: false, reason: e.message }
    }
    throw e
  }
}

export interface CatchUpSummary {
  monthsProcessed: number
  assetsProcessed: number
  posted: number
  alreadyPosted: number
  skipped: number
  failures: { assetId: string; year: number; month: number; reason: string }[]
}

/**
 * Catch up depreciation posting for every asset across a year-month range
 * (inclusive). Use to backfill historical periods or catch up after a gap.
 * Idempotent — already-posted months are counted but not re-posted.
 *
 *   from = { year: 2026, month: 1 }
 *   to   = { year: 2026, month: 4 }   // months 1..4 inclusive
 */
export async function runDepreciationCatchUp(
  prisma: PrismaClient,
  from: { year: number; month: number },
  to:   { year: number; month: number },
  createdById: string,
  branch?: string,
): Promise<CatchUpSummary> {
  const summary: CatchUpSummary = {
    monthsProcessed: 0, assetsProcessed: 0,
    posted: 0, alreadyPosted: 0, skipped: 0, failures: [],
  }
  if (process.env.ENABLE_GL_POSTING !== 'true') return summary

  const where = branch && branch !== 'ALL'
    ? { branch: branch as 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' | 'VERDANA_STORE' | 'AURA_INSTITUTE' }
    : {}
  const assets = await prisma.asset.findMany({
    where,
    select: { id: true },
  })
  summary.assetsProcessed = assets.length

  // Iterate months
  let y = from.year, m = from.month
  while (y < to.year || (y === to.year && m <= to.month)) {
    summary.monthsProcessed++
    for (const a of assets) {
      const r = await postMonthlyDepreciation(prisma, a.id, y, m, createdById)
      if (r.posted)            summary.posted++
      else if (r.alreadyPosted) summary.alreadyPosted++
      else {
        summary.skipped++
        if (r.reason && !/asset purchased after|fully depreciated before|monthlyDepreciation is zero/.test(r.reason)) {
          summary.failures.push({ assetId: a.id, year: y, month: m, reason: r.reason })
        }
      }
    }
    m++
    if (m > 12) { m = 1; y++ }
  }
  return summary
}
