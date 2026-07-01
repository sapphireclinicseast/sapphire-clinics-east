/**
 * Tier 3 Step 9 — Reports v2: trial-balance-only aggregator.
 *
 * Replaces the 635-line ad-hoc derivation in /api/reports with a thin layer
 * over the General Ledger:
 *
 *   1. Fetch every JournalEntryLine for the period (one query).
 *   2. Fetch every BeginningBalance for the year (one query).
 *   3. Bucket by month + account; compute per-account closing balances.
 *   4. Group by accountType + subType into BS / IS / CF sections.
 *   5. Return.
 *
 * Because EVERY business event posts through `postJournalEntry` (which refuses
 * unbalanced entries by design), the resulting BS is mathematically guaranteed
 * to satisfy A = L + E. The `trialBalance.balanced` flag is the proof.
 *
 * Cash Flow Statement is currently the simple direct method (cash-account
 * movements). Step 11 will add the indirect method (NI + non-cash + ΔWC).
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeTrialBalance } from '@/lib/accounting/trial-balance'
import { computeIndirectCashFlow } from '@/lib/accounting/cash-flow'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

const isCash = (n: string, t: string) => /^10/.test(n) || /cash|bank/i.test(t)

interface AccountInfo {
  id: string; accountNumber: string; accountTitle: string
  accountType: string; subType: string | null; subSubType: string | null
  normalBalance: 'DEBIT' | 'CREDIT'
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const year   = parseInt(searchParams.get('year') || String(new Date().getUTCFullYear()))
  const branch = searchParams.get('branch') || 'ALL'

  const startDate = new Date(Date.UTC(year, 0, 1))
  const endDate   = new Date(Date.UTC(year + 1, 0, 1))

  try {
    const [accounts, lines, openings, trialBalance, indirectCF] = await Promise.all([
      prisma.account.findMany({
        where: { isActive: true },
        select: { id: true, accountNumber: true, accountTitle: true, accountType: true, subType: true, subSubType: true, normalBalance: true },
        orderBy: { accountNumber: 'asc' },
      }),
      prisma.journalEntryLine.findMany({
        where: {
          journalEntry: {
            entryDate: { gte: startDate, lt: endDate },
            ...(branch !== 'ALL' ? { branch } : {}),
          },
        },
        select: {
          accountId: true, debit: true, credit: true,
          journalEntry: { select: { entryDate: true, referenceType: true } },
        },
      }),
      prisma.beginningBalance.findMany({
        where: { periodYear: year },
        select: { accountId: true, amount: true },
      }),
      computeTrialBalance(prisma, {
        asOf:   new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
        branch,
      }),
      computeIndirectCashFlow(prisma, { year, branch }),
    ])

    const acctById = new Map<string, AccountInfo>(accounts.map(a => [a.id, a as AccountInfo]))
    const openingByAcctId = new Map<string, number>(openings.map(o => [o.accountId, Number(o.amount)]))

    /* ── Per-month, per-account movements ──────────────────────────
       Two views:
         movements      — every JE line (used for BS — closing entries
                          correctly zero R/E and roll NI into Retained Earnings)
         opsMovements   — excludes CLOSING_ENTRY / CLOSING_ENTRY_REVERSAL
                          (used for IS — shows operating activity, not the
                          balance transfers of closing) */
    const movements:    Record<number, Record<string, { dr: number; cr: number }>> = {}
    const opsMovements: Record<number, Record<string, { dr: number; cr: number }>> = {}
    for (let m = 1; m <= 12; m++) { movements[m] = {}; opsMovements[m] = {} }
    for (const l of lines) {
      const m = new Date(l.journalEntry.entryDate).getUTCMonth() + 1
      const slot = movements[m][l.accountId] || (movements[m][l.accountId] = { dr: 0, cr: 0 })
      slot.dr += Number(l.debit  || 0)
      slot.cr += Number(l.credit || 0)
      const refType = l.journalEntry.referenceType
      if (refType !== 'CLOSING_ENTRY' && refType !== 'CLOSING_ENTRY_REVERSAL') {
        const ops = opsMovements[m][l.accountId] || (opsMovements[m][l.accountId] = { dr: 0, cr: 0 })
        ops.dr += Number(l.debit  || 0)
        ops.cr += Number(l.credit || 0)
      }
    }

    /* ── Helper: closing balance per account, signed by normalBalance ── */
    const closingFor = (accountId: string): number => {
      const a = acctById.get(accountId); if (!a) return 0
      let dr = 0, cr = 0
      for (let m = 1; m <= 12; m++) {
        const s = movements[m][accountId]; if (!s) continue
        dr += s.dr; cr += s.cr
      }
      const opening = openingByAcctId.get(accountId) || 0
      return a.normalBalance === 'DEBIT' ? opening + dr - cr : opening + cr - dr
    }
    const periodTotalFor = (accountId: string, side: 'dr' | 'cr'): number => {
      let total = 0
      for (let m = 1; m <= 12; m++) {
        const s = movements[m][accountId]; if (!s) continue
        total += s[side]
      }
      return total
    }
    /** IS-only view: excludes closing entries / reversals so the IS shows
        operating activity, not the balance transfers of close-the-books. */
    const opsPeriodTotalFor = (accountId: string, side: 'dr' | 'cr'): number => {
      let total = 0
      for (let m = 1; m <= 12; m++) {
        const s = opsMovements[m][accountId]; if (!s) continue
        total += s[side]
      }
      return total
    }

    /* ── Bucketed sums for BS / IS ───────────────────────────────── */
    let cashBalance = 0, arBalance = 0, otherCurrentAssets = 0, inventoryBalance = 0
    let ppeGross = 0, accumDep = 0, otherNonCurrentAssets = 0
    let currentLiabilities = 0, nonCurrentLiabilities = 0, equityBalance = 0
    let revenue = 0, discounts = 0, cogs = 0, opex = 0, depExpense = 0, otherExpense = 0
    const cashByAccountKey: Record<string, number> = {}
    const revenueByAccountKey: Record<string, number> = {}
    const expenseByAccountKey: Record<string, number> = {}

    for (const a of accounts) {
      const bal = closingFor(a.id)
      const key = `${a.accountNumber} ${a.accountTitle}`

      if (a.accountType === 'ASSET') {
        if (isCash(a.accountNumber, a.accountTitle)) {
          cashBalance += bal
          cashByAccountKey[key] = bal
        } else if (a.accountNumber === '1010' || /accounts? receivable/i.test(a.accountTitle)) {
          arBalance += bal
        } else if (a.subType === 'CURRENT_ASSETS') {
          otherCurrentAssets += bal
        } else if (a.subType?.startsWith('INV') || /inventory|merchandise/i.test(a.accountTitle)) {
          inventoryBalance += bal
        } else if (a.accountNumber === '2010' || /accumulated.*depreciation/i.test(a.accountTitle)) {
          accumDep += bal   // contra-asset; closingFor() already returns signed
        } else if (a.subType === 'PPE' || /^2(?!010)/.test(a.accountNumber)) {
          ppeGross += bal
        } else {
          otherNonCurrentAssets += bal
        }
      } else if (a.accountType === 'LIABILITY') {
        if (a.subType === 'NON_CURRENT_LIABILITIES') nonCurrentLiabilities += bal
        else                                          currentLiabilities    += bal
      } else if (a.accountType === 'EQUITY') {
        equityBalance += bal
      } else if (a.accountType === 'REVENUE') {
        // Discount accounts have normalBalance=DEBIT; everything else CR.
        // Use IS-only movements so post-close runs still report the year's NI.
        if (a.normalBalance === 'DEBIT') discounts += opsPeriodTotalFor(a.id, 'dr') - opsPeriodTotalFor(a.id, 'cr')
        else                              revenue   += opsPeriodTotalFor(a.id, 'cr') - opsPeriodTotalFor(a.id, 'dr')
        revenueByAccountKey[key] = a.normalBalance === 'DEBIT'
          ? opsPeriodTotalFor(a.id, 'dr') - opsPeriodTotalFor(a.id, 'cr')
          : opsPeriodTotalFor(a.id, 'cr') - opsPeriodTotalFor(a.id, 'dr')
      } else if (a.accountType === 'EXPENSE') {
        const periodAmt = opsPeriodTotalFor(a.id, 'dr') - opsPeriodTotalFor(a.id, 'cr')
        expenseByAccountKey[key] = periodAmt
        if (a.subType === 'COGS' || /cost of goods|cogs/i.test(a.accountTitle))            cogs       += periodAmt
        else if (/depreciation/i.test(a.accountTitle) || a.accountNumber === '8070')         depExpense += periodAmt
        else if (a.subType === 'INDIRECT_EXPENSES' || a.subType === 'OPERATING_EXPENSES')   opex       += periodAmt
        else if (a.subType === 'DIRECT_EXPENSES')                                           cogs       += periodAmt
        else                                                                                 otherExpense += periodAmt
      }
    }

    const netSales    = revenue - discounts
    const grossProfit = netSales - cogs
    const ebitda      = grossProfit - opex
    const netIncome   = ebitda - depExpense - otherExpense

    const totalCurrentAssets    = cashBalance + arBalance + otherCurrentAssets + inventoryBalance
    const totalNonCurrentAssets = ppeGross + accumDep + otherNonCurrentAssets   // accumDep is negative
    const totalAssets           = totalCurrentAssets + totalNonCurrentAssets
    const totalLiabilities      = currentLiabilities + nonCurrentLiabilities
    const totalEquity           = equityBalance + netIncome
    const totalLiabAndEquity    = totalLiabilities + totalEquity

    /* ── Cash Flow (direct method, simple) ───────────────────────── */
    // Sum DR/CR on cash accounts per month → net cash inflow/outflow
    const cashFlowByMonth: Record<number, { in: number; out: number; net: number }> = {}
    for (let m = 1; m <= 12; m++) cashFlowByMonth[m] = { in: 0, out: 0, net: 0 }
    for (const a of accounts) {
      if (a.accountType !== 'ASSET' || !isCash(a.accountNumber, a.accountTitle)) continue
      for (let m = 1; m <= 12; m++) {
        const s = movements[m][a.id]; if (!s) continue
        cashFlowByMonth[m].in  += s.dr
        cashFlowByMonth[m].out += s.cr
        cashFlowByMonth[m].net += s.dr - s.cr
      }
    }

    /* ── COA grouping for the UI ─────────────────────────────────── */
    const groupedAccounts: Record<string, Record<string, AccountInfo[]>> = {}
    for (const a of accounts) {
      const t = a.accountType
      const s = a.subType || 'UNCATEGORIZED'
      groupedAccounts[t] ||= {}
      groupedAccounts[t][s] ||= []
      groupedAccounts[t][s].push(a as AccountInfo)
    }

    return NextResponse.json({
      year, branch,
      accounts: groupedAccounts,
      trialBalance: {
        balanced: trialBalance.balanced,
        diff:     trialBalance.diff,
        totals:   trialBalance.totals,
      },
      balanceSheet: {
        cash:               cashBalance,
        cashByAccount:      cashByAccountKey,
        ar:                 arBalance,
        otherCurrentAssets, inventory: inventoryBalance,
        totalCurrentAssets,
        ppeGross, accumulatedDepreciation: accumDep, otherNonCurrentAssets,
        totalNonCurrentAssets,
        totalAssets,
        currentLiabilities, nonCurrentLiabilities,
        totalLiabilities,
        openingEquity: equityBalance, netIncome,
        totalEquity,
        totalLiabAndEquity,
        balanced: Math.abs(totalAssets - totalLiabAndEquity) < 0.01,
        diff:     totalAssets - totalLiabAndEquity,
      },
      incomeStatement: {
        revenue, discounts, netSales, cogs, grossProfit,
        opex, ebitda, depreciation: depExpense, otherExpense,
        netIncome,
        revenueByAccount: revenueByAccountKey,
        expenseByAccount: expenseByAccountKey,
      },
      cashFlow: {
        // Direct method: cash-account JE movements per month.
        direct: {
          byMonth: cashFlowByMonth,
          netChange: Object.values(cashFlowByMonth).reduce((s, m) => s + m.net, 0),
        },
        // Indirect method (Tier 3 Step 11): NI + non-cash + ΔWC + investing + financing.
        // The reconciliationGap MUST be ~0 — if not, a cash event was recorded
        // outside the posting service and needs investigation, not a plug.
        indirect: indirectCF,
      },
      monthlyMovements: movements,   // raw — for drill-down or per-month BS/IS rendering
      beginningBalances: openings,
    })
  } catch (err) {
    console.error('[GET /api/reports/v2]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
