import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { computeLedgerStatements, type V2Statements } from '@/lib/reports/v2/engine'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'INVESTOR', 'MEDREP', 'PAYROLL_OFFICER']
// Med reps and the payroll officer see SALES only (Hannah 2026-10-13), now from
// this same ledger engine as everyone else (Hannah 2026-11-15: their old
// order-based report mixed branches and subtracted every edited order). The
// server strips the payload to the Gross Revenue section, so expenses, the
// balance sheet and cash flow never reach their browser.
const REVENUE_ONLY_ROLES = ['MEDREP', 'PAYROLL_OFFICER']

function revenueOnlyView(s: V2Statements): V2Statements {
  const revenue = s.incomeStatement.sections.filter(sec => sec.key === 'REVENUE')
  return {
    year: s.year, branch: s.branch, engine: s.engine,
    validation: {
      openingPlug: 0, imbalancePlugs: [], unclassified: [], synthesized: [], fromLedger: [], notes: [],
      aEqualsLE: true, aLEDiff: 0, cfTies: true,
    },
    incomeStatement: {
      sections: revenue, productSubtypes: s.incomeStatement.productSubtypes,
      netSales: 0, totalCOGS: 0, grossProfit: 0, totalOpex: 0, ebitda: 0, depreciation: 0,
      interest: 0, nonOperating: 0, ebt: 0, taxProvision: 0, netIncome: 0,
    },
    balanceSheet: { sections: [], totalAssets: 0, totalLiabilities: 0, totalEquity: 0, incomeTaxPayable: 0, deferredTaxAsset: 0, netIncome: 0 },
    cashFlow: {
      netIncome: 0, depreciation: 0, taxProvision: 0, workingCapital: [], netOperating: 0, investing: [], netInvesting: 0,
      financing: [], netFinancing: 0, netChange: 0, beginningCash: 0, endingCash: 0, cashAccounts: [],
      monthly: { netIncome: [], depreciation: [], taxProvision: [], cashDelta: [] },
    },
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
  const branch = searchParams.get('branch') || 'ALL'
  if (year < 2024) {
    return NextResponse.json({ error: 'The ledger engine starts with 2024 — no transaction data exists before that.' }, { status: 400 })
  }
  // Optional drill-down: return the underlying lines for one account (+month)
  const account = searchParams.get('account') || undefined
  const revenueOnly = REVENUE_ONLY_ROLES.includes(session.user.role as string)
  // Drill-downs reach patient-level lines and every account — not for sales-only roles.
  if (revenueOnly && account) return NextResponse.json({ error: 'Not available for this role' }, { status: 403 })
  const monthParam = searchParams.get('month')
  const month = monthParam ? parseInt(monthParam) : undefined
  const cumulative = searchParams.get('cumulative') === '1'
  // Day detail for the income statement rows, for reports on exact dates.
  const daily = searchParams.get('daily') === '1'
  try {
    const statements = await computeLedgerStatements(
      year, branch,
      account ? { account, ...(month && month >= 1 && month <= 12 ? { month, ...(cumulative ? { cumulative: true } : {}) } : {}) } : undefined,
      daily ? { daily: true } : undefined,
    )
    /* Investors see the subsidiary ledger — every line, every amount, so the
       ledger provably ties to the statements — but not who was treated or
       paid: patient and personnel identities are clinic-confidential. Lines
       from mechanical sources carry no person, so their labels pass through;
       everything else keeps its reference (order #, PCV, cutoff) and loses
       the free text after it. */
    if (account && (session.user.role as string) === 'INVESTOR' && statements.collected) {
      const KEEP_FULL = /^(bank-trueup|bank-opening-trueup|float-floor|period-fee|depreciation|interbranch|opening|history:)/
      statements.collected = statements.collected.map(l => {
        if (KEEP_FULL.test(l.source)) return l
        const head = l.label.split(' — ')[0].split(' | ')[0]
        return { ...l, label: head === l.label ? head : `${head} — (details withheld for privacy)` }
      })
    }
    return NextResponse.json(revenueOnly ? revenueOnlyView(statements) : statements)
  } catch (err) {
    console.error('Reports v2 error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
