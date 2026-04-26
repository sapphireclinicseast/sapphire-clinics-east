/**
 * Tier 3 Step 11 — Indirect-method Cash Flow Statement.
 *
 * Net Cash from Operations  = Net Income
 *                           + Depreciation & other non-cash expenses
 *                           − Δ Accounts Receivable
 *                           − Δ Inventory
 *                           + Δ Accounts Payable
 *                           + Δ Accrued Liabilities (other current liabilities)
 *                           + Δ Unearned Revenue
 *
 * Net Cash from Investing   = − Δ PPE (gross)            (purchases)
 *                           − Δ Other Non-Current Assets
 *
 * Net Cash from Financing   = + Δ Long-Term Liabilities  (loan proceeds − payments)
 *                           + Δ Owner's Equity contributions − distributions
 *
 * Net Change in Cash        = Operations + Investing + Financing
 *                           ≡ Closing Cash − Opening Cash    (must reconcile)
 *
 * Δ X = closing X − opening X.
 *   For ASSET accounts, "increase" means more asset on the books.
 *   For LIABILITY/EQUITY, "increase" means more credit balance.
 *
 * The reconciliation gap (`reconciliationGap`) MUST be ~0 if every cash event
 * has been posted through the GL. If non-zero, an event was recorded outside
 * the posting service — surface it loudly rather than plug.
 */

import type { PrismaClient } from '@prisma/client'

const TOLERANCE = 0.01

const isCash = (n: string, t: string)         => /^10/.test(n) || /cash|bank/i.test(t)
const isAR   = (n: string, t: string)         => n === '1010' || /accounts? receivable|receivable/i.test(t)
const isInventory = (sub: string | null, t: string) => (sub || '').startsWith('INV') || /inventory|merchandise/i.test(t)
const isPPE  = (n: string, sub: string | null) => sub === 'PPE' || (/^2/.test(n) && n !== '2010')
const isAccumDep = (n: string, t: string)     => n === '2010' || /accumulated.*depreciation/i.test(t)
const isAP   = (sub: string | null, t: string) => sub === 'CURRENT_LIABILITIES' && /payable/i.test(t)
const isUnearned = (n: string, t: string)     => n === '4050' || n === '4055' || /unearned/i.test(t)
const isDepExpense = (n: string, t: string)   => n === '8070' || /depreciation/i.test(t)

export interface CashFlowSection {
  netIncome:       number
  addBacks:        { depreciation: number; otherNonCash: number }
  workingCapital:  { deltaAR: number; deltaInventory: number; deltaAP: number; deltaAccruals: number; deltaUnearned: number }
  netCashFromOperations: number
  netCashFromInvesting:  number
  netCashFromFinancing:  number
  netChangeInCash:       number
  openingCash:           number
  closingCash:           number
  reconciliationGap:     number  // (opening + netChange) − closing, should ≈ 0
  reconciled:            boolean
  details: {
    investingPPE: number
    investingOther: number
    financingLongTermDebt: number
    financingEquity: number
  }
}

export interface CashFlowOptions {
  year:   number
  branch?: string
}

interface AccountInfo {
  id: string
  accountNumber: string
  accountTitle:  string
  accountType:   string
  subType:       string | null
  normalBalance: 'DEBIT' | 'CREDIT'
}

export async function computeIndirectCashFlow(prisma: PrismaClient, opts: CashFlowOptions): Promise<CashFlowSection> {
  const { year, branch = 'ALL' } = opts
  const startDate = new Date(Date.UTC(year, 0, 1))
  const endDate   = new Date(Date.UTC(year + 1, 0, 1))

  const [accounts, lines, openings] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      select: { id: true, accountNumber: true, accountTitle: true, accountType: true, subType: true, normalBalance: true },
    }),
    prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          entryDate: { gte: startDate, lt: endDate },
          ...(branch !== 'ALL' ? { branch } : {}),
          // Exclude closing entries — they're balance transfers, not cash events.
          referenceType: { notIn: ['CLOSING_ENTRY', 'CLOSING_ENTRY_REVERSAL'] },
        },
      },
      select: {
        accountId: true, debit: true, credit: true,
        journalEntry: { select: { referenceType: true } },
      },
    }),
    prisma.beginningBalance.findMany({
      where: { periodYear: year },
      select: { accountId: true, amount: true },
    }),
  ])

  const acctById = new Map<string, AccountInfo>(accounts.map(a => [a.id, a as AccountInfo]))
  const openingByAcctId = new Map<string, number>(openings.map(o => [o.accountId, Number(o.amount)]))

  // Per-account YTD movement totals
  const drByAcct = new Map<string, number>()
  const crByAcct = new Map<string, number>()
  let depreciationAddBack = 0
  for (const l of lines) {
    drByAcct.set(l.accountId, (drByAcct.get(l.accountId) || 0) + Number(l.debit  || 0))
    crByAcct.set(l.accountId, (crByAcct.get(l.accountId) || 0) + Number(l.credit || 0))

    // Identify depreciation add-back via DEPRECIATION-tagged JE lines that
    // debit the depreciation expense account.
    if (l.journalEntry.referenceType === 'DEPRECIATION') {
      const a = acctById.get(l.accountId)
      if (a && a.accountType === 'EXPENSE') depreciationAddBack += Number(l.debit || 0)
    }
  }

  // Helper: closing balance signed by normalBalance
  const closingBalance = (a: AccountInfo): number => {
    const dr = drByAcct.get(a.id) || 0
    const cr = crByAcct.get(a.id) || 0
    const opening = openingByAcctId.get(a.id) || 0
    return a.normalBalance === 'DEBIT' ? opening + dr - cr : opening + cr - dr
  }

  const sumDelta = (accs: AccountInfo[]): number => {
    let opening = 0, closing = 0
    for (const a of accs) {
      opening += openingByAcctId.get(a.id) || 0
      closing += closingBalance(a)
    }
    return closing - opening
  }
  const sumOpening = (accs: AccountInfo[]): number => accs.reduce((s, a) => s + (openingByAcctId.get(a.id) || 0), 0)
  const sumClosing = (accs: AccountInfo[]): number => accs.reduce((s, a) => s + closingBalance(a), 0)

  // Bucket accounts
  const cashAccts:    AccountInfo[] = []
  const arAccts:      AccountInfo[] = []
  const invAccts:     AccountInfo[] = []
  const apAccts:      AccountInfo[] = []
  const accrualAccts: AccountInfo[] = []
  const unearnedAccts:AccountInfo[] = []
  const ppeAccts:     AccountInfo[] = []
  const accumDepAccts:AccountInfo[] = []
  const otherNonCurrentAssets: AccountInfo[] = []
  const longTermDebt: AccountInfo[] = []
  const equityAccts:  AccountInfo[] = []
  const revenueAccts: AccountInfo[] = []
  const expenseAccts: AccountInfo[] = []

  for (const a of accounts) {
    if (a.accountType === 'ASSET') {
      if      (isCash(a.accountNumber, a.accountTitle))            cashAccts.push(a as AccountInfo)
      else if (isAR(a.accountNumber, a.accountTitle))              arAccts.push(a as AccountInfo)
      else if (isInventory(a.subType, a.accountTitle))             invAccts.push(a as AccountInfo)
      else if (isAccumDep(a.accountNumber, a.accountTitle))        accumDepAccts.push(a as AccountInfo)
      else if (isPPE(a.accountNumber, a.subType))                  ppeAccts.push(a as AccountInfo)
      else if (a.subType !== 'CURRENT_ASSETS')                     otherNonCurrentAssets.push(a as AccountInfo)
    } else if (a.accountType === 'LIABILITY') {
      if      (isUnearned(a.accountNumber, a.accountTitle))        unearnedAccts.push(a as AccountInfo)
      else if (isAP(a.subType, a.accountTitle))                    apAccts.push(a as AccountInfo)
      else if (a.subType === 'NON_CURRENT_LIABILITIES')            longTermDebt.push(a as AccountInfo)
      else                                                          accrualAccts.push(a as AccountInfo)
    } else if (a.accountType === 'EQUITY') {
      equityAccts.push(a as AccountInfo)
    } else if (a.accountType === 'REVENUE') {
      revenueAccts.push(a as AccountInfo)
    } else if (a.accountType === 'EXPENSE') {
      expenseAccts.push(a as AccountInfo)
    }
  }

  // Net Income (IS-style: revenue minus discounts minus expenses)
  let revenue = 0, discounts = 0, expenseTotal = 0
  for (const a of revenueAccts) {
    const dr = drByAcct.get(a.id) || 0
    const cr = crByAcct.get(a.id) || 0
    if (a.normalBalance === 'DEBIT') discounts += dr - cr
    else                              revenue   += cr - dr
  }
  for (const a of expenseAccts) {
    const dr = drByAcct.get(a.id) || 0
    const cr = crByAcct.get(a.id) || 0
    expenseTotal += dr - cr
  }
  const netIncome = revenue - discounts - expenseTotal

  // Working capital deltas
  const deltaAR        = sumDelta(arAccts)
  const deltaInventory = sumDelta(invAccts)
  const deltaAP        = sumDelta(apAccts)
  const deltaAccruals  = sumDelta(accrualAccts)
  const deltaUnearned  = sumDelta(unearnedAccts)

  const otherNonCash = 0  // future: amortization, etc.

  const netCashFromOperations =
    netIncome + depreciationAddBack + otherNonCash
    - deltaAR - deltaInventory
    + deltaAP + deltaAccruals + deltaUnearned

  // Investing
  const investingPPE      = -sumDelta(ppeAccts)              // increase in PPE = outflow
  const investingOther    = -sumDelta(otherNonCurrentAssets)
  const netCashFromInvesting = investingPPE + investingOther

  // Financing
  const financingLongTermDebt = sumDelta(longTermDebt)        // ↑ debt = inflow
  const financingEquity       = sumDelta(equityAccts) - netIncome  // strip out NI (it's already in ops via closing-or-IS)
  const netCashFromFinancing  = financingLongTermDebt + financingEquity

  const netChangeInCash = netCashFromOperations + netCashFromInvesting + netCashFromFinancing
  const openingCash = sumOpening(cashAccts)
  const closingCash = sumClosing(cashAccts)
  const reconciliationGap = (openingCash + netChangeInCash) - closingCash

  return {
    netIncome,
    addBacks: { depreciation: depreciationAddBack, otherNonCash },
    workingCapital: { deltaAR, deltaInventory, deltaAP, deltaAccruals, deltaUnearned },
    netCashFromOperations,
    netCashFromInvesting,
    netCashFromFinancing,
    netChangeInCash,
    openingCash, closingCash,
    reconciliationGap,
    reconciled: Math.abs(reconciliationGap) < TOLERANCE,
    details: { investingPPE, investingOther, financingLongTermDebt, financingEquity },
  }
}
