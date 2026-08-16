/**
 * Single source of truth for the P&L chain:
 *
 *   Net Sales − Cost of Sales = Gross Profit
 *   − Operating Expenses      = EBITDA
 *   − Depreciation − Interest − Non-Operating = EBT
 *   − Provision for Income Tax (20%)          = Net Income
 *
 * The Income Statement, the Balance Sheet (retained earnings / equity) and the
 * Cash Flow Statement (indirect method) MUST all derive these figures from this
 * helper so the three statements stay interconnected — same Net Income on all
 * three, and A = L + E holds by construction.
 *
 * Bucketing is defensive about CoA subType assignments: 8070 (Depreciation) and
 * 8310 (Interest) are pulled out of whatever subType they were filed under so
 * EBITDA stays a true pre-depreciation/pre-interest figure, and any expense
 * subType outside the known operating buckets lands in Non-Operating instead of
 * silently dropping out of Net Income (the old behaviour).
 */

export interface IsAccountEntry {
  accountNumber: string
  accountTitle: string
  subSubType: string | null
  normalBalance: string
  currency: string
}

export interface IsMonthData {
  serviceRevenue: number
  productRevenue: number
  cogs: number
  revenueByAccount: Record<string, number>
  expenseByAccount: Record<string, number>
}

export interface IsReportData {
  monthly: Record<number, IsMonthData>
  accounts: Record<string, Record<string, IsAccountEntry[]>>
  depreciation?: { byMonth: Record<number, number> }
}

/** CREATE-Act corporate income tax rate — matches the FY2024–FY2026 FS package. */
// Set to 0 per Hannah (2026-08-16): a provision is an estimate with no cash
// effect — actual income tax is booked in 8270 Taxes and Licenses when paid.
export const INCOME_TAX_RATE = 0

const DEPRECIATION_ACCT = '8070'
const INTEREST_ACCT = '8310'

export interface IncomeStatementTotals {
  effectiveGrossRevenue: number
  totalDiscounts: number
  netSales: number
  totalCOGS: number          // inventory COGS + direct/COGS journal expenses
  inventoryCogs: number      // inventory FIFO COGS only
  directJournalExpenses: number
  grossProfit: number
  totalOpex: number
  ebitda: number
  totalDepreciation: number  // asset schedule + any 8070 journal amounts
  totalInterest: number
  totalNonOperating: number
  ebt: number
  taxProvision: number       // INCOME_TAX_RATE × EBT (negative on losses, per the FS package)
  netIncome: number
  // Account buckets (already relocated: no 8070/8310 in any of these)
  costOfSalesAccts: IsAccountEntry[]
  operatingExpenseAccts: IsAccountEntry[]
  interestAccts: IsAccountEntry[]
  nonOperatingAccts: IsAccountEntry[]
  // Per-month getters for monthly rendering
  grossRevenueForMonth: (m: IsMonthData) => number
  discountsForMonth:    (m: IsMonthData) => number
  netSalesForMonth:     (m: IsMonthData) => number
  directExpForMonth:    (m: IsMonthData) => number
  indirectExpForMonth:  (m: IsMonthData) => number
  interestForMonth:     (m: IsMonthData) => number
  nonOperatingForMonth: (m: IsMonthData) => number
  journalDepForMonth:   (m: IsMonthData) => number
}

function sumMonths(monthly: Record<number, IsMonthData>, getter: (m: IsMonthData) => number): number {
  let total = 0
  for (let i = 1; i <= 12; i++) total += getter(monthly[i])
  return total
}

export function computeIncomeStatementTotals(data: IsReportData): IncomeStatementTotals {
  const { monthly, accounts } = data

  // Revenue accounts — gather from ALL revenue subTypes
  const allRevenueSubTypes = accounts.REVENUE ? Object.values(accounts.REVENUE).flat() : []
  const grossRevenueAccts = allRevenueSubTypes.filter(a => a.normalBalance !== 'DEBIT')
  const discountAccts     = allRevenueSubTypes.filter(a => a.normalBalance === 'DEBIT')

  // Expense buckets. Depreciation (8070) and Interest (8310) get their own lines
  // below EBITDA regardless of which subType they were filed under.
  const expenseSubTypes = accounts.EXPENSE || {}
  const costOfSalesAccts: IsAccountEntry[] = []
  const operatingExpenseAccts: IsAccountEntry[] = []
  const nonOperatingAccts: IsAccountEntry[] = []
  const interestAccts: IsAccountEntry[] = []
  const depreciationAccts: IsAccountEntry[] = []
  for (const [subType, accts] of Object.entries(expenseSubTypes)) {
    for (const a of accts) {
      if (a.accountNumber === DEPRECIATION_ACCT) { depreciationAccts.push(a); continue }
      if (a.accountNumber === INTEREST_ACCT) { interestAccts.push(a); continue }
      if (subType === 'DIRECT_EXPENSES' || subType.startsWith('COGS')) costOfSalesAccts.push(a)
      else if (subType === 'INDIRECT_EXPENSES' || subType === 'OPERATING_EXPENSES') operatingExpenseAccts.push(a)
      else nonOperatingAccts.push(a)
    }
  }
  const directExpenseAccts = costOfSalesAccts
  const indirectExpenseAccts = operatingExpenseAccts

  // Collect revenue keys present in monthly data (catch-all for un-COA'd revenue)
  const allRevenueKeys = new Set<string>()
  for (let m = 1; m <= 12; m++) {
    for (const k of Object.keys(monthly[m].revenueByAccount || {})) allRevenueKeys.add(k)
  }
  const knownAcctKeys = new Set<string>([
    ...grossRevenueAccts.map(a => `${a.accountNumber} ${a.accountTitle}`),
    ...discountAccts.map(a => `${a.accountNumber} ${a.accountTitle}`),
  ])
  const unmatchedRevenueKeys = Array.from(allRevenueKeys).filter(k => !knownAcctKeys.has(k))

  const acctAmount = (acctNum: string, acctTitle: string) => {
    const key = `${acctNum} ${acctTitle}`
    return sumMonths(monthly, m => (m.revenueByAccount || {})[key] || 0)
  }
  const expenseAmount = (acctNum: string, acctTitle: string) => {
    const key = `${acctNum} ${acctTitle}`
    return sumMonths(monthly, m => (m.expenseByAccount || {})[key] || 0)
  }
  const bucketForMonth = (accts: IsAccountEntry[]) => (m: IsMonthData) =>
    accts.reduce((s, a) => s + ((m.expenseByAccount || {})[`${a.accountNumber} ${a.accountTitle}`] || 0), 0)

  // Per-month helpers
  const grossRevenueForMonth = (m: IsMonthData) => {
    const coaRev = grossRevenueAccts.reduce(
      (s, a) => s + ((m.revenueByAccount || {})[`${a.accountNumber} ${a.accountTitle}`] || 0), 0)
    const unmatched = unmatchedRevenueKeys.reduce((s, k) => s + ((m.revenueByAccount || {})[k] || 0), 0)
    return (coaRev + unmatched) > 0 ? (coaRev + unmatched) : (m.serviceRevenue + m.productRevenue)
  }
  const discountsForMonth = (m: IsMonthData) =>
    discountAccts.reduce((s, a) => s + ((m.revenueByAccount || {})[`${a.accountNumber} ${a.accountTitle}`] || 0), 0)
  const netSalesForMonth = (m: IsMonthData) => grossRevenueForMonth(m) - discountsForMonth(m)
  const directExpForMonth = bucketForMonth(directExpenseAccts)
  const indirectExpForMonth = bucketForMonth(indirectExpenseAccts)
  const interestForMonth = bucketForMonth(interestAccts)
  const nonOperatingForMonth = bucketForMonth(nonOperatingAccts)
  const journalDepForMonth = bucketForMonth(depreciationAccts)

  // Annual totals — use the same per-month logic so monthly+annual always reconcile
  const totalGrossRevenue = grossRevenueAccts.reduce((s, a) => s + acctAmount(a.accountNumber, a.accountTitle), 0)
  const unmatchedRevenueTotal = unmatchedRevenueKeys.reduce(
    (s, key) => s + sumMonths(monthly, m => (m.revenueByAccount || {})[key] || 0), 0)
  const fallbackGrossRevenue = sumMonths(monthly, m => m.serviceRevenue + m.productRevenue)
  const effectiveGrossRevenue = (totalGrossRevenue + unmatchedRevenueTotal) > 0
    ? totalGrossRevenue + unmatchedRevenueTotal
    : fallbackGrossRevenue

  const totalDiscounts = discountAccts.reduce((s, a) => s + acctAmount(a.accountNumber, a.accountTitle), 0)
  const netSales       = effectiveGrossRevenue - totalDiscounts

  const inventoryCogs        = sumMonths(monthly, m => m.cogs)
  const directJournalExpenses = directExpenseAccts.reduce(
    (s, a) => s + expenseAmount(a.accountNumber, a.accountTitle), 0)
  const totalCOGS  = inventoryCogs + directJournalExpenses
  const grossProfit = netSales - totalCOGS

  const totalOpex = indirectExpenseAccts.reduce(
    (s, a) => s + expenseAmount(a.accountNumber, a.accountTitle), 0)
  const ebitda = grossProfit - totalOpex

  // Depreciation = asset schedule + anything posted straight to 8070
  const scheduleDepreciation = Object.values(data.depreciation?.byMonth || {})
    .reduce((s, v) => s + v, 0)
  const journalDepreciation = sumMonths(monthly, journalDepForMonth)
  const totalDepreciation = scheduleDepreciation + journalDepreciation

  const totalInterest = sumMonths(monthly, interestForMonth)
  const totalNonOperating = sumMonths(monthly, nonOperatingForMonth)

  const ebt = ebitda - totalDepreciation - totalInterest - totalNonOperating
  const taxProvision = ebt * INCOME_TAX_RATE
  const netIncome = ebt - taxProvision

  return {
    effectiveGrossRevenue, totalDiscounts, netSales,
    totalCOGS, inventoryCogs, directJournalExpenses,
    grossProfit, totalOpex, ebitda,
    totalDepreciation, totalInterest, totalNonOperating, ebt, taxProvision, netIncome,
    costOfSalesAccts, operatingExpenseAccts, interestAccts, nonOperatingAccts,
    grossRevenueForMonth, discountsForMonth, netSalesForMonth,
    directExpForMonth, indirectExpForMonth,
    interestForMonth, nonOperatingForMonth, journalDepForMonth,
  }
}
