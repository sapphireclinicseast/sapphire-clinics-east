/**
 * Special payroll runs — 13th-month pay, maternity pay, final pay.
 *
 * These are paid outside the two regular cutoffs but must behave like payroll
 * everywhere else: locked, posted to the ledger, paid through Salaries Payable,
 * and reported on the withholding-tax (1601-C) computation. Rather than a
 * parallel table, each one is an EmployeePayslip whose `cutoffPeriod` carries a
 * suffix instead of the cutoff number — the same pattern the government-
 * contribution catch-up (`YYYY-MM-GOVCON`) already uses:
 *
 *   2026-12-13TH              one 13th-month run per month, shared by a branch
 *   2026-11-13TH-1            one part of a scheduled 13th month, paid with that cutoff
 *   2026-10-MAT-<employee>    one maternity run per employee
 *   2026-10-FINAL-<employee>  one final-pay run per employee
 *
 * Every consumer that groups payroll by month reads `cutoffPeriod.slice(0, 7)`
 * (or `split('-')[1]`), so a suffixed period lands in the right month with no
 * change, and `/api/payroll/finalize` never parses the period at all. Maternity
 * and final pay are keyed per employee so each one locks, posts and is paid on
 * its own — they are individual events, not a batch.
 *
 * `details.specialRun` marks the row and `details.taxableIncome` is ALWAYS set:
 * the 1601-C falls back to treating the whole gross as taxable when it is
 * missing, which would tax an exempt 13th month.
 *
 * 13th-month payout schedule (Hannah, 2026-11-03): a year can release the 13th
 * month in parts, each with a regular cutoff, e.g. 50% with the November 1st
 * cutoff and the rest with the November 2nd. Each part is its own run
 * (`YYYY-MM-13TH-<cutoff>`), locked, posted and paid on its own. A part pays up
 * to its CUMULATIVE share of the 13th month less what is already paid, so the
 * last part always pays the balance, trued up to the basic salary on file by
 * then. A year with no schedule keeps the single run per month.
 *
 * `details.holdFromStaff` keeps a 13th-month payslip out of the staff's My
 * Payslips (teletherapy hub) until payroll releases it. Locking never emails
 * or notifies anyone, and /api/payroll/email refuses a 13th-month period
 * outright (Hannah, 2026-11-03: it goes out with the succeeding payrolls).
 */

export type SpecialRunType = 'THIRTEENTH' | 'MATERNITY' | 'FINAL'

export const SPECIAL_SUFFIX: Record<SpecialRunType, string> = {
  THIRTEENTH: '13TH',
  MATERNITY: 'MAT',
  FINAL: 'FINAL',
}

export const SPECIAL_LABEL: Record<SpecialRunType, string> = {
  THIRTEENTH: '13th Month Pay',
  MATERNITY: 'Maternity Pay',
  FINAL: 'Final Pay',
}

/** 13th-month pay and other benefits are income-tax exempt up to this much per year (NIRC Sec. 32(B)(7)(e), TRAIN). */
export const THIRTEENTH_EXEMPT_CEILING = 90000

/** Monetised unused leave is de minimis (exempt) up to this many days a year for private employees. */
export const LEAVE_CONVERSION_EXEMPT_DAYS = 10

const SPECIAL_RX = /^(\d{4})-(\d{2})-(13TH|MAT|FINAL)(?:-(.+))?$/
const REGULAR_RX = /^\d{4}-\d{2}-[12]$/

/** A regular cutoff payslip ("2026-03-1" / "2026-03-2") — the only rows that count toward basic salary earned. */
export const isRegularCutoff = (cutoffPeriod: string) => REGULAR_RX.test(cutoffPeriod)

export function parseSpecialPeriod(cutoffPeriod: string): { year: number; month: number; type: SpecialRunType; key: string | null; cutoff: 1 | 2 | null } | null {
  const m = SPECIAL_RX.exec(cutoffPeriod || '')
  if (!m) return null
  const type: SpecialRunType = m[3] === '13TH' ? 'THIRTEENTH' : m[3] === 'MAT' ? 'MATERNITY' : 'FINAL'
  const cutoff = type === 'THIRTEENTH' && (m[4] === '1' || m[4] === '2') ? (Number(m[4]) as 1 | 2) : null
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), type, key: m[4] || null, cutoff }
}

export const isSpecialPeriod = (cutoffPeriod: string) => SPECIAL_RX.test(cutoffPeriod || '')

/** Period key for a run. Maternity / final pay are per employee, so they carry a short employee key. */
export function specialPeriod(type: SpecialRunType, year: number, month: number, employeeId?: string): string {
  const base = `${year}-${String(month).padStart(2, '0')}-${SPECIAL_SUFFIX[type]}`
  if (type === 'THIRTEENTH') return base
  return `${base}-${String(employeeId || '').slice(-8).toUpperCase()}`
}

/** A 13th-month run: the whole month (`2026-12-13TH`), or one scheduled part paid with a cutoff (`2026-11-13TH-1`). */
export const thirteenthPeriod = (year: number, month: number, cutoff?: number | null) =>
  `${specialPeriod('THIRTEENTH', year, month)}${cutoff === 1 || cutoff === 2 ? `-${cutoff}` : ''}`

export const cutoffLabel = (cutoff: number) => (cutoff === 1 ? '1st cutoff' : '2nd cutoff')

/** One scheduled part of the 13th month: paid with that month's cutoff, `percent` of the full 13th month. */
export interface ThirteenthTranche { month: number; cutoff: 1 | 2; percent: number }
/** Stored on EmployeeSettings.thirteenthMonthSchedule, keyed by year. */
export type ThirteenthSchedule = Record<string, ThirteenthTranche[]>

/** Validate and sort a year's tranches. An empty list is valid: it clears the schedule. */
export function cleanTranches(raw: unknown): { tranches: ThirteenthTranche[]; problem: string | null } {
  const list = Array.isArray(raw) ? raw : []
  const tranches = list.map(t => ({
    month: parseInt(String((t as ThirteenthTranche)?.month), 10),
    cutoff: parseInt(String((t as ThirteenthTranche)?.cutoff), 10) as 1 | 2,
    percent: r2(Number((t as ThirteenthTranche)?.percent)),
  })).sort((a, b) => a.month - b.month || a.cutoff - b.cutoff)
  if (tranches.length === 0) return { tranches, problem: null }
  if (tranches.length > 6) return { tranches, problem: 'A 13th month can be split into at most 6 payouts.' }
  for (const t of tranches) {
    if (!(t.month >= 1 && t.month <= 12) || (t.cutoff !== 1 && t.cutoff !== 2)) return { tranches, problem: 'Each payout needs a month and a cutoff.' }
    if (!(t.percent > 0 && t.percent <= 100)) return { tranches, problem: 'Each payout needs a percentage above 0.' }
  }
  const seen = new Set(tranches.map(t => `${t.month}-${t.cutoff}`))
  if (seen.size !== tranches.length) return { tranches, problem: 'Two payouts are set for the same cutoff.' }
  const total = r2(tranches.reduce((s, t) => s + t.percent, 0))
  if (Math.abs(total - 100) > 0.001) return { tranches, problem: `The payouts add up to ${total}% — they must add up to 100%.` }
  return { tranches, problem: null }
}

/**
 * Where a cutoff sits in a year's schedule. `cumPercent` is the share of the
 * 13th month that should be paid once this part is out; the last part is
 * always 100%, so it pays whatever is left.
 */
export function trancheFor(tranches: ThirteenthTranche[], month: number, cutoff: number) {
  const index = tranches.findIndex(t => t.month === month && t.cutoff === cutoff)
  if (index < 0) return null
  const isLast = index === tranches.length - 1
  const cumPercent = isLast ? 100 : r2(tranches.slice(0, index + 1).reduce((s, t) => s + t.percent, 0))
  return { ...tranches[index], index, count: tranches.length, isLast, cumPercent }
}

/** What this part pays: its cumulative share of the 13th month, less what is already paid. */
export const trancheDue = (accrued: number, cumPercent: number, alreadyPaid: number) =>
  r2(Math.max(0, accrued * (cumPercent / 100) - alreadyPaid))

/** True when payroll is still keeping this payslip out of the staff's My Payslips. */
export const isHeldFromStaff = (details: unknown) =>
  !!details && typeof details === 'object' && (details as { holdFromStaff?: unknown }).holdFromStaff === true

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Human label for any payroll period — regular cutoffs, special runs and the gov-con catch-up. Null when it is none of them. */
export function specialPeriodLabel(cutoffPeriod: string): string | null {
  const s = parseSpecialPeriod(cutoffPeriod)
  if (s) return `${SPECIAL_LABEL[s.type]} — ${MONTHS[s.month - 1] || s.month} ${s.year}${s.cutoff ? `, ${cutoffLabel(s.cutoff)}` : ''}`
  const g = /^(\d{4})-(\d{2})-GOVCON$/.exec(cutoffPeriod || '')
  if (g) return `Gov't contribution catch-up — ${MONTHS[parseInt(g[2], 10) - 1]} ${g[1]}`
  return null
}

/** TRAIN-law monthly withholding table (2023 onwards) — same brackets payroll uses for the regular cutoffs. */
export function trainTaxMonthly(taxableMonthly: number): number {
  if (taxableMonthly <= 0) return 0
  if (taxableMonthly <= 20833) return 0
  if (taxableMonthly <= 33333) return (taxableMonthly - 20833) * 0.15
  if (taxableMonthly <= 66667) return 1875 + (taxableMonthly - 33333) * 0.20
  if (taxableMonthly <= 166667) return 8541.67 + (taxableMonthly - 66667) * 0.25
  if (taxableMonthly <= 666667) return 33541.67 + (taxableMonthly - 166667) * 0.30
  return 183541.67 + (taxableMonthly - 666667) * 0.35
}

/** Earning lines a special run can carry. */
export type SpecialLineKind =
  | 'THIRTEENTH'          // 13th-month pay (exempt within the ₱90,000 ceiling)
  | 'LEAVE_CONVERSION'    // unused leave converted to cash (exempt for the first 10 days)
  | 'SALARY_DIFFERENTIAL' // maternity: full pay less the SSS benefit (exempt)
  | 'OTHER_TAXABLE'       // e.g. unpaid salary carried into final pay
  | 'OTHER_NONTAXABLE'    // e.g. refund of a deposit

export interface SpecialLine { kind: SpecialLineKind; label: string; amount: number; days?: number; rate?: number }
export interface SpecialDeduction { label: string; amount: number; staffLoanId?: string | null }

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

/**
 * Split a run's earnings into what is taxable and what is exempt.
 * `exemptUsed` = 13th-month/other-benefit exemption this employee has already
 * used this year in OTHER runs, so the ₱90,000 ceiling is applied across the
 * year (a 13th month paid in December after a mid-year bonus, or the pro-rated
 * 13th month inside a final pay).
 */
export function classifyLines(lines: SpecialLine[], exemptUsed: number) {
  let gross = 0, thirteenth = 0, exempt13th = 0, exemptOther = 0, taxable = 0
  let room = Math.max(0, THIRTEENTH_EXEMPT_CEILING - (Number(exemptUsed) || 0))
  for (const l of lines) {
    const amt = r2(l.amount)
    if (!(amt > 0)) continue
    gross += amt
    if (l.kind === 'THIRTEENTH') {
      thirteenth += amt
      const ex = Math.min(amt, room)
      room -= ex; exempt13th += ex; taxable += amt - ex
    } else if (l.kind === 'LEAVE_CONVERSION') {
      const days = Number(l.days) || 0
      const exDays = days > 0 ? Math.min(days, LEAVE_CONVERSION_EXEMPT_DAYS) : 0
      const ex = days > 0 ? r2(amt * (exDays / days)) : amt
      exemptOther += ex; taxable += amt - ex
    } else if (l.kind === 'OTHER_TAXABLE') {
      taxable += amt
    } else {
      exemptOther += amt   // SALARY_DIFFERENTIAL, OTHER_NONTAXABLE
    }
  }
  return { gross: r2(gross), thirteenth: r2(thirteenth), exempt13th: r2(exempt13th), exemptOther: r2(exemptOther), taxable: r2(taxable) }
}

/**
 * Withholding on a special run: the extra tax its taxable part adds on top of
 * what the same month's other payslips already carry — so the month as a whole
 * still agrees with the graduated table the 1601-C checks against.
 */
export function marginalTax(monthTaxableElsewhere: number, taxable: number, isMWE: boolean): number {
  if (isMWE || !(taxable > 0)) return 0
  const base = Math.max(0, Number(monthTaxableElsewhere) || 0)
  return r2(Math.max(0, trainTaxMonthly(base + taxable) - trainTaxMonthly(base)))
}
