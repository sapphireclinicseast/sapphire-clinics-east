/**
 * Indirect-method Cash Flow figures, derived from the SAME building blocks the
 * Balance Sheet uses, so the three statements tie out:
 *
 *   Net Income (from the Income Statement helper)
 *   + Depreciation (non-cash add-back)
 *   − Increase in AR / Inventory / other current assets
 *   + Increase in payables / unearned revenue
 *   − Purchases of PPE                       (investing)
 *   + Net equity movements (issuance − dividends − buyback)   (financing)
 *   = Net change in cash
 *   + Beginning cash  = Ending cash          (must equal the Balance-Sheet cash)
 *
 * The cash math below MIRRORS the Balance Sheet's cash computation exactly, so
 * `endingCash` here equals `totalCash` there. Any derivation gap between the
 * bottom-up indirect build and the actual cash movement is surfaced as an
 * explicit `unreconciled` line rather than hidden, keeping the statement honest.
 */

import { computeIncomeStatementTotals, type IsReportData } from './income-statement-totals'

interface CfAccountEntry { accountNumber: string; accountTitle: string }
interface CfData extends IsReportData {
  inventory: { total: number; byDepartment: Record<string, number> }
  wallets: { total: number; byType: Record<string, number> }
  accountsReceivable?: { total: number; byCashAccount?: { accountNumber: string; accountTitle: string; amount: number }[] }
  inventorySourceAccounts?: { accountNumber: string; accountTitle: string; accountType: string; amount: number }[]
  unclassifiedAP?: number
  journalBalances?: { accountNumber: string; accountTitle: string; accountType: string; balance: number }[]
  depreciation?: { byMonth: Record<number, number>; accumulated: number; assetsByClassification: Record<string, number> }
  beginningBalances?: { accountNumber: string; accountTitle: string; accountType: string; amount: number }[]
  cashAdjustments?: {
    openingByAccount: Record<string, number>
    inventoryCashOutflowsByAccount: Record<string, number>
    assetCashOutflows: number
    journalCashFlowByAccount: Record<string, number>
    defaultCashAccountKey: string | null
  }
  unearnedRevenueFromAR?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  monthly: Record<number, any>
}

export interface CashFlowTotals {
  netIncome: number
  depreciation: number
  // Working-capital changes (increase in an asset is a USE of cash → negative)
  arChange: number
  inventoryChange: number
  otherCurrentAssetChange: number
  payablesChange: number
  unearnedChange: number
  netCashFromOperations: number
  // Investing
  ppePurchases: number          // outflow (positive magnitude)
  netCashFromInvesting: number
  // Financing
  equityFinancing: number       // net equity issuance − dividends − buyback (signed)
  netCashFromFinancing: number
  // Reconciliation to the Balance-Sheet cash balance
  computedNetChange: number     // ops + investing + financing
  beginningCash: number
  endingCash: number            // == Balance-Sheet total cash
  actualNetChange: number       // endingCash − beginningCash
  unreconciled: number          // actualNetChange − computedNetChange (derivation gap)
}

export function computeCashFlowTotals(data: CfData): CashFlowTotals {
  const { netIncome, totalDepreciation } = computeIncomeStatementTotals(data as unknown as IsReportData)

  const monthly = data.monthly
  const cashAdj = data.cashAdjustments || {
    openingByAccount: {}, inventoryCashOutflowsByAccount: {},
    assetCashOutflows: 0, journalCashFlowByAccount: {}, defaultCashAccountKey: null,
  }

  // ── Ending cash — MIRRORS BalanceSheet's cash computation exactly ──
  const cashByAccountBalance: Record<string, number> = {}
  let beginningCash = 0
  for (const [k, v] of Object.entries(cashAdj.openingByAccount)) {
    cashByAccountBalance[k] = (cashByAccountBalance[k] || 0) + v
    beginningCash += v
  }
  for (let m = 1; m <= 12; m++) {
    for (const [k, v] of Object.entries((monthly[m]?.cashByAccount || {}) as Record<string, number>)) {
      cashByAccountBalance[k] = (cashByAccountBalance[k] || 0) + v
    }
  }
  if (data.accountsReceivable?.byCashAccount) {
    for (const ca of data.accountsReceivable.byCashAccount) {
      const k = `${ca.accountNumber} ${ca.accountTitle}`
      cashByAccountBalance[k] = (cashByAccountBalance[k] || 0) + ca.amount
    }
  }
  for (const [k, v] of Object.entries(cashAdj.journalCashFlowByAccount)) {
    cashByAccountBalance[k] = (cashByAccountBalance[k] || 0) + v
  }
  for (const [k, v] of Object.entries(cashAdj.inventoryCashOutflowsByAccount)) {
    cashByAccountBalance[k] = (cashByAccountBalance[k] || 0) - v
  }
  if (cashAdj.assetCashOutflows > 0 && cashAdj.defaultCashAccountKey) {
    cashByAccountBalance[cashAdj.defaultCashAccountKey] =
      (cashByAccountBalance[cashAdj.defaultCashAccountKey] || 0) - cashAdj.assetCashOutflows
  }
  const endingCash = Object.values(cashByAccountBalance).reduce((s, v) => s + v, 0)

  // ── Opening balances by account (for working-capital deltas) ──
  const openingByAcctNum: Record<string, number> = {}
  for (const ob of (data.beginningBalances || [])) openingByAcctNum[ob.accountNumber] = ob.amount
  const sumOpening = (accts: { accountNumber: string }[]) =>
    accts.reduce((s, a) => s + (openingByAcctNum[a.accountNumber] || 0), 0)

  // Account groups from the CoA
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acc = data.accounts as any
  const currentAssetAccounts: CfAccountEntry[] = acc.ASSET?.CURRENT_ASSETS || []
  const inventoryAccounts: CfAccountEntry[] = acc.ASSET?.INVENTORY || []

  // ── Ending working-capital balances (mirror BalanceSheet) ──
  const deductionAccountTotals: Record<string, number> = {}
  for (let m = 1; m <= 12; m++) {
    for (const [key, val] of Object.entries((monthly[m]?.deductionsByAccount || {}) as Record<string, number>)) {
      deductionAccountTotals[key] = (deductionAccountTotals[key] || 0) + val
    }
  }
  const arTotal = data.accountsReceivable?.total || 0
  const invTotal = data.inventory.total
  // Other current assets = CWT / Input VAT / prepaid etc. (excluding AR account 1010)
  const deductionAssetTotal = currentAssetAccounts.reduce((s, a) => {
    const key = `${a.accountNumber} ${a.accountTitle}`
    return s + (deductionAccountTotals[key] || 0)
  }, 0)

  const liabilitySourceAccounts = (data.inventorySourceAccounts || []).filter(a => a.accountType === 'LIABILITY')
  const sourceAccountTotal = liabilitySourceAccounts.reduce((s, a) => s + a.amount, 0) + (data.unclassifiedAP || 0)
  const payrollPayableTotal = (data.journalBalances || [])
    .filter(jb => jb.accountType === 'LIABILITY' && jb.balance > 0 && jb.accountNumber !== '4050')
    .reduce((s, a) => s + a.balance, 0)
  const payablesEnding = sourceAccountTotal + payrollPayableTotal
  const unearnedEnding = data.wallets.total + (data.unearnedRevenueFromAR || 0)

  // ── Opening balances per category (0 unless entered in Beginning Balances) ──
  const openingAR = openingByAcctNum['1010'] || 0
  const openingInv = sumOpening(inventoryAccounts)
  const openingOtherCA = currentAssetAccounts
    .filter(a => a.accountNumber !== '1010')
    .reduce((s, a) => s + (openingByAcctNum[a.accountNumber] || 0), 0)
  const currentLiabAccounts: CfAccountEntry[] = acc.LIABILITY?.CURRENT_LIABILITIES || []
  const openingPayables = currentLiabAccounts
    .filter(a => a.accountNumber !== '4050' && a.accountNumber !== '4055')
    .reduce((s, a) => s + (openingByAcctNum[a.accountNumber] || 0), 0)
  const openingUnearned = (openingByAcctNum['4050'] || 0) + (openingByAcctNum['4055'] || 0)

  // ── Working-capital changes (sign = effect on cash) ──
  const arChange = -(arTotal - openingAR)                       // AR up → cash down
  const inventoryChange = -(invTotal - openingInv)              // Inv up → cash down
  const otherCurrentAssetChange = -(deductionAssetTotal - openingOtherCA)
  const payablesChange = payablesEnding - openingPayables       // Payables up → cash up
  const unearnedChange = unearnedEnding - openingUnearned       // Unearned up → cash up

  const netCashFromOperations =
    netIncome + totalDepreciation + arChange + inventoryChange +
    otherCurrentAssetChange + payablesChange + unearnedChange

  // ── Investing: PPE purchased at cost this period ──
  const ppePurchases = cashAdj.assetCashOutflows || 0
  const netCashFromInvesting = -ppePurchases

  // ── Financing: net equity movement.  For every equity JE the cash leg equals
  //    the equity leg (issuance DR bank/CR capital; dividend DR RE/CR bank;
  //    buyback DR treasury/CR bank), so net equity journal balance == net
  //    financing cash flow. ──
  const equityFinancing = (data.journalBalances || [])
    .filter(jb => jb.accountType === 'EQUITY')
    .reduce((s, jb) => s + jb.balance, 0)
  const netCashFromFinancing = equityFinancing

  const computedNetChange = netCashFromOperations + netCashFromInvesting + netCashFromFinancing
  const actualNetChange = endingCash - beginningCash
  const unreconciled = actualNetChange - computedNetChange

  return {
    netIncome, depreciation: totalDepreciation,
    arChange, inventoryChange, otherCurrentAssetChange, payablesChange, unearnedChange,
    netCashFromOperations,
    ppePurchases, netCashFromInvesting,
    equityFinancing, netCashFromFinancing,
    computedNetChange, beginningCash, endingCash, actualNetChange, unreconciled,
  }
}
