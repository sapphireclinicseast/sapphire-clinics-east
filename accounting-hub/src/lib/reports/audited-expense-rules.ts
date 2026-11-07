// Which Valid expense rows the Audited statement counts, and how a branch view
// reads a shared row (Hannah's rulings, 2026-11-07).
//
// The route reads validity = 'Valid' only; these rules apply on top of that tag.
// Compensation goes by account, not memo wording: a word match on "payroll" used
// to decide it, which dropped consultant fees for saying "Payroll" and kept the
// same fees when the memo happened not to. The memo is read for two things only:
// the card import's own mark, and "no valid SI", which bookkeepers write as a
// standard phrase and which keeps a row off the BIR list too.
//
// skipReports is deliberately NOT a rule. It means "a journal entry already
// carries this", not "this is not an expense": it is on every 2024-25 row and on
// real 2026 costs such as business tax. Only the two cases below that use it
// narrow it to something the statement must leave out.

// Payroll has no consultant or employee records before this date, so until then
// Valid expense rows are the only record of salaries and consultant fees.
export const PAYROLL_MODULE_START = new Date('2026-04-01T00:00:00+08:00')

// 8190 consultant fees, 8231/8232 salaries, 8380/8390 13th month.
const COMPENSATION_ACCOUNT = /^\s*(8190|8231|8232|8380|8390)\b/

// Written into the memo by the card statement import. The purchase itself is a
// separate ccimp_ row, which counts once someone reviews it and tags it Valid.
const CARD_BILL_MARK = 'Card BILL payment'

// Same match as the BIR valid-expenses list, so the two leave out the same rows.
const NO_VALID_SI = /no\s*valid\s*(si|or|receipt|invoice)|without\s*(si|valid)|no\s*si\b|no\s*receipt|invalid\s*si/i

export type AuditedExclusion = 'coveredByPayroll' | 'recurringSetup' | 'recurringCopy' | 'cardBill' | 'noValidSi'

interface RuleRow {
  date: Date | null
  accountTitle: string | null
  description: string | null
  recordType: string | null
  distributeMonthly: boolean | null
  sourceRecurringId: string | null
  skipReports: boolean | null
}

/** Why the statement leaves this Valid row out, or null when it counts. */
export function auditedExclusion(e: RuleRow): AuditedExclusion | null {
  // A recurring setup that is not spread monthly is a template: the one-time
  // entries generated from it are the expense. Same rule as the Income Statement.
  if (e.recordType === 'RECURRING' && !e.distributeMonthly) return 'recurringSetup'
  // A one-time payment copy of a spread recurring entry, which already counts.
  if (e.sourceRecurringId) return 'recurringCopy'
  if ((e.description || '').includes(CARD_BILL_MARK)) return 'cardBill'
  // From April 2026 Payroll reports compensation. The switch separates the rows a
  // Payroll journal carries from one-off pay Payroll never ran, such as back-pay
  // adjustments, which the Income Statement counts from the row itself.
  if (
    COMPENSATION_ACCOUNT.test(e.accountTitle || '') &&
    e.date && e.date >= PAYROLL_MODULE_START &&
    e.skipReports
  ) return 'coveredByPayroll'
  if (NO_VALID_SI.test(e.description || '')) return 'noValidSi'
  return null
}

interface BranchRow {
  branch: string | null
  grossAmount: unknown
  branchAllocations: unknown
}

const namedShares = (e: BranchRow) =>
  (Array.isArray(e.branchAllocations) ? e.branchAllocations : [])
    .filter((a): a is { branch: string; amount?: number | string } => !!a?.branch)

/** This row's amount in one branch's view. Shares never add up to more or less than the entry. */
export function auditedBranchAmount(e: BranchRow, branch: string): number {
  const gross = Number(e.grossAmount) || 0
  const shares = namedShares(e)
  const sharesTotal = shares.reduce((s, a) => s + (Number(a.amount) || 0), 0)
  if (!sharesTotal) return e.branch === branch ? gross : 0
  const mine = shares.filter(a => a.branch === branch).reduce((s, a) => s + (Number(a.amount) || 0), 0)
  return Math.abs(sharesTotal - gross) < 0.005 ? mine : mine * (gross / sharesTotal)
}

/** A CEO row with no branch share belongs to no branch, so it counts only under All Branches. */
export function hasNoBranch(e: BranchRow): boolean {
  if (e.branch !== 'CEO') return false
  return !namedShares(e).some(a => Number(a.amount))
}
