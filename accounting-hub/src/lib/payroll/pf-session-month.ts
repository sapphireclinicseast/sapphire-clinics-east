import type { PrismaClient, Prisma } from '@prisma/client'

/**
 * Consultant professional fees belong to the month the SESSION happened, not
 * the month of the cutoff that pays them (Hannah, 2026-10-30: "I want to see
 * the sessions done and the payout that matches the date of those sessions").
 *
 * The 1st cutoff of a month runs from the 26th of the previous month to the
 * 10th (lib/payroll-cutoff.ts), and its payroll journal books the whole cutoff
 * in the cutoff's month — so every month carried the previous month's last
 * 5–6 days of sessions and lost its own. Each locked payslip stores every
 * unit-pay line's sessions with their Manila date, so the share that belongs
 * to another month is exact, not an estimate.
 *
 * The payroll journal itself is left untouched: payables, remittances, RFPs
 * and bank matching all key off it. Beside it, for each other month:
 *   accrual   — dated that month's last day:     Dr Professional Fees / Cr Salaries Payable
 *   reversal  — dated the cutoff month's 1st:    Dr Salaries Payable / Cr Professional Fees
 * so the expense lands in the session month, the month-end balance sheet shows
 * the fee as owed, and Salaries Payable nets back to zero once the cutoff's own
 * month opens. Retainers, incentives, manually added unit pays and adjustments
 * carry no session date and stay in the cutoff's month.
 */

type Tx = PrismaClient | Prisma.TransactionClient

export const PF_ACCRUAL_TYPE = 'PAYROLL_CONSULTANT_ACCRUAL'
export const PF_ACCRUAL_REVERSAL_TYPE = 'PAYROLL_CONSULTANT_ACCRUAL_REVERSAL'

/**
 * First cutoff the ledger accruals apply to. Every earlier cutoff was already
 * restated to the session month by the 2026-08-04 manual journals
 * (MJE-2025-0001…0003, MJE-2026-0001…0011); deriving accruals for those too
 * would move the same days twice.
 */
export const PF_SESSION_MONTH_FROM = '2026-05-1'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function parseCutoff(cutoffPeriod: string): { year: number; month: number; half: number } | null {
  const m = cutoffPeriod.match(/^(\d{4})-(\d{1,2})-(\d)$/)
  if (!m) return null
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), half: parseInt(m[3], 10) }
}

/** "2026-05-1" → "2026-05". */
export function cutoffYm(cutoffPeriod: string): string | null {
  const c = parseCutoff(cutoffPeriod)
  return c ? `${c.year}-${String(c.month).padStart(2, '0')}` : null
}

/** Whether a cutoff gets ledger accruals (on or after PF_SESSION_MONTH_FROM). */
export function usesSessionMonthAccruals(cutoffPeriod: string): boolean {
  const c = parseCutoff(cutoffPeriod)
  const f = parseCutoff(PF_SESSION_MONTH_FROM)!
  if (!c) return false
  return c.year !== f.year ? c.year > f.year
    : c.month !== f.month ? c.month > f.month
    : c.half >= f.half
}

/**
 * The unit-pay amounts on one payslip whose sessions fall OUTSIDE the cutoff's
 * month, keyed "YYYY-MM". A session's amount is its line's unit rate × the
 * session quantity — the same product the line total is built from.
 */
export function otherMonthSessionPf(items: unknown, cutoffPeriod: string): Map<string, number> {
  const own = cutoffYm(cutoffPeriod)
  const out = new Map<string, number>()
  if (!own || !Array.isArray(items)) return out
  for (const item of items as { unitAmount?: unknown; sessions?: { date?: unknown; quantity?: unknown }[] }[]) {
    const rate = Number(item?.unitAmount) || 0
    if (!rate || !Array.isArray(item.sessions)) continue
    for (const s of item.sessions) {
      const ym = typeof s?.date === 'string' ? s.date.slice(0, 7) : ''
      if (!/^\d{4}-\d{2}$/.test(ym) || ym === own) continue
      const qty = s.quantity == null ? 1 : Number(s.quantity) || 0
      out.set(ym, (out.get(ym) || 0) + rate * qty)
    }
  }
  return out
}

const r2 = (n: number) => Math.round(n * 100) / 100
// Noon in Manila (04:00 UTC) keeps the date the same in every timezone the
// reports bucket by.
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0, 4))
const firstDayOf = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1, 4))

export interface PfAccrual { ym: string; amount: number }

/**
 * Re-derive the accrual pairs for one cutoff + branch from its LOCKED payslips:
 * whatever pairs exist are deleted and rebuilt, so calling it again after a
 * re-finalize converges instead of stacking. A cutoff before
 * PF_SESSION_MONTH_FROM only has its pairs removed.
 */
export async function syncPfSessionAccruals(tx: Tx, args: {
  cutoffPeriod: string
  branch: string             // payroll code (SBEA / SBGH / …)
  ledgerBranch: string       // JournalEntry.branch (SANDBOX_EAST / …)
  branchLabel: string        // for descriptions (AHEA / AHGH / …)
  feesAccountId: string
  payableAccountId: string
  userId: string
}): Promise<PfAccrual[]> {
  const { cutoffPeriod, branch } = args
  await deletePfSessionAccruals(tx, cutoffPeriod, branch)
  const c = parseCutoff(cutoffPeriod)
  if (!c || !usesSessionMonthAccruals(cutoffPeriod)) return []

  const entries = await tx.payrollEntry.findMany({
    where: { cutoffPeriod, branch, status: 'LOCKED' },
    select: { items: true },
  })
  const byYm = new Map<string, number>()
  for (const e of entries) {
    for (const [ym, amt] of otherMonthSessionPf(e.items, cutoffPeriod)) byYm.set(ym, (byYm.get(ym) || 0) + amt)
  }

  const own = cutoffYm(cutoffPeriod)!
  const posted: PfAccrual[] = []
  for (const [ym, raw] of [...byYm.entries()].sort()) {
    const amount = r2(raw)
    if (amount < 0.01) continue
    const [y, m] = ym.split('-').map(Number)
    const sessionMonth = `${MONTHS[m - 1]} ${y}`
    const earlier = ym < own
    // Dr fees in the session month, Cr fees in the cutoff month. Sessions from
    // an earlier month (the normal case) accrue at that month's end and reverse
    // when the cutoff's month opens; a later month (only possible with a
    // custom date range) mirrors it.
    const accrualDate = earlier ? lastDayOf(y, m) : firstDayOf(y, m)
    const reversalDate = earlier ? firstDayOf(c.year, c.month) : lastDayOf(c.year, c.month)
    const ref = `${cutoffPeriod}|${branch}|${ym}`
    await tx.journalEntry.create({
      data: {
        entryDate: accrualDate,
        description: `Consultant fees for ${sessionMonth} sessions, paid in cutoff ${cutoffPeriod} — ${args.branchLabel}`,
        referenceType: PF_ACCRUAL_TYPE,
        referenceId: ref,
        totalAmount: amount,
        branch: args.ledgerBranch,
        createdById: args.userId,
        lines: {
          create: [
            { accountId: args.feesAccountId, debit: amount, credit: 0, description: `Professional Fees — ${sessionMonth} sessions` },
            { accountId: args.payableAccountId, debit: 0, credit: amount, description: `Salaries Payable — fees owed for ${sessionMonth} sessions` },
          ],
        },
      },
    })
    await tx.journalEntry.create({
      data: {
        entryDate: reversalDate,
        description: `Reversal — ${sessionMonth} session fees moved out of cutoff ${cutoffPeriod} — ${args.branchLabel}`,
        referenceType: PF_ACCRUAL_REVERSAL_TYPE,
        referenceId: ref,
        totalAmount: amount,
        branch: args.ledgerBranch,
        createdById: args.userId,
        lines: {
          create: [
            { accountId: args.payableAccountId, debit: amount, credit: 0, description: `Salaries Payable — ${sessionMonth} accrual reversed` },
            { accountId: args.feesAccountId, debit: 0, credit: amount, description: `Professional Fees — ${sessionMonth} sessions, booked in ${sessionMonth} instead` },
          ],
        },
      },
    })
    posted.push({ ym, amount })
  }
  return posted
}

/** Remove a cutoff + branch's accrual pairs (unlock, or before a rebuild). */
export async function deletePfSessionAccruals(tx: Tx, cutoffPeriod: string, branch: string): Promise<void> {
  const where = {
    referenceType: { in: [PF_ACCRUAL_TYPE, PF_ACCRUAL_REVERSAL_TYPE] },
    referenceId: { startsWith: `${cutoffPeriod}|${branch}|` },
  }
  const jes = await tx.journalEntry.findMany({ where, select: { id: true } })
  if (!jes.length) return
  const ids = jes.map(j => j.id)
  await tx.journalEntryLine.deleteMany({ where: { journalEntryId: { in: ids } } })
  await tx.journalEntry.deleteMany({ where: { id: { in: ids } } })
}
