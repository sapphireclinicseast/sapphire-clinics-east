/**
 * Single source of truth for Net Income.
 * Both the Income Statement and the Balance Sheet (for retained-earnings / equity)
 * MUST derive Net Income from this helper so the two reports stay in lock-step
 * with the accounting equation A = L + E.
 *
 * The previous Balance Sheet computed NI inline and:
 *   - summed discount accounts as positive revenue (instead of subtracting)
 *   - omitted indirect operating expenses
 *   - omitted direct journal-entry expenses (e.g. Professional Fees 8190)
 * which produced an NI different from the Income Statement and broke the BS.
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

export interface IncomeStatementTotals {
  effectiveGrossRevenue: number
  totalDiscounts: number
  netSales: number
  totalCOGS: number          // inventory COGS + direct journal expenses
  inventoryCogs: number      // inventory FIFO COGS only
  directJournalExpenses: number
  grossProfit: number
  totalOpex: number
  ebitda: number
  totalDepreciation: number
  netIncome: number
  // Per-month getters for monthly rendering
  grossRevenueForMonth: (m: IsMonthData) => number
  discountsForMonth:    (m: IsMonthData) => number
  netSalesForMonth:     (m: IsMonthData) => number
  directExpForMonth:    (m: IsMonthData) => number
  indirectExpForMonth:  (m: IsMonthData) => number
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

  // Expense accounts by sub-type
  const directExpenseAccts   = accounts.EXPENSE?.DIRECT_EXPENSES   || []
  const indirectExpenseAccts = accounts.EXPENSE?.INDIRECT_EXPENSES || []

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
  const directExpForMonth = (m: IsMonthData) =>
    directExpenseAccts.reduce((s, a) => s + ((m.expenseByAccount || {})[`${a.accountNumber} ${a.accountTitle}`] || 0), 0)
  const indirectExpForMonth = (m: IsMonthData) =>
    indirectExpenseAccts.reduce((s, a) => s + ((m.expenseByAccount || {})[`${a.accountNumber} ${a.accountTitle}`] || 0), 0)

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

  const totalDepreciation = Object.values(data.depreciation?.byMonth || {})
    .reduce((s, v) => s + v, 0)
  const netIncome = ebitda - totalDepreciation

  return {
    effectiveGrossRevenue, totalDiscounts, netSales,
    totalCOGS, inventoryCogs, directJournalExpenses,
    grossProfit, totalOpex, ebitda, totalDepreciation, netIncome,
    grossRevenueForMonth, discountsForMonth, netSalesForMonth,
    directExpForMonth, indirectExpForMonth,
  }
}
