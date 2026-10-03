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

export function parseSpecialPeriod(cutoffPeriod: string): { year: number; month: number; type: SpecialRunType; key: string | null } | null {
  const m = SPECIAL_RX.exec(cutoffPeriod || '')
  if (!m) return null
  const type: SpecialRunType = m[3] === '13TH' ? 'THIRTEENTH' : m[3] === 'MAT' ? 'MATERNITY' : 'FINAL'
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), type, key: m[4] || null }
}

export const isSpecialPeriod = (cutoffPeriod: string) => SPECIAL_RX.test(cutoffPeriod || '')

/** Period key for a run. Maternity / final pay are per employee, so they carry a short employee key. */
export function specialPeriod(type: SpecialRunType, year: number, month: number, employeeId?: string): string {
  const base = `${year}-${String(month).padStart(2, '0')}-${SPECIAL_SUFFIX[type]}`
  if (type === 'THIRTEENTH') return base
  return `${base}-${String(employeeId || '').slice(-8).toUpperCase()}`
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Human label for any payroll period — regular cutoffs, special runs and the gov-con catch-up. Null when it is none of them. */
export function specialPeriodLabel(cutoffPeriod: string): string | null {
  const s = parseSpecialPeriod(cutoffPeriod)
  if (s) return `${SPECIAL_LABEL[s.type]} — ${MONTHS[s.month - 1] || s.month} ${s.year}`
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
