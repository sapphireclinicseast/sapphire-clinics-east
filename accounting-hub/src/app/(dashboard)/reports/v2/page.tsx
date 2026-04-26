'use client'

/**
 * Tier 3 Step 12 — Reports v2 UI.
 *
 * Consumes /api/reports/v2 (trial-balance-driven) and renders BS / IS / CF
 * straight from the precomputed totals. No client-side derivation, no
 * possibility of drift between sections.
 *
 * Three banners at the top tell the truth at a glance:
 *   1. Trial Balance — must be balanced (proves every JE is double-entry)
 *   2. Balance Sheet — must satisfy A = L + E (derived from the same TB)
 *   3. Cash Flow indirect — closingCash MUST equal openingCash + netChange
 *
 * If any of those flips red, a posting bypass exists somewhere in the code.
 * Fix the source, never plug the report.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, Calendar, Building2, FileText, BarChart3, LayoutList } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface TbTotals { openingDR: number; openingCR: number; periodDR: number; periodCR: number; closingDR: number; closingCR: number }
interface BS {
  cash: number; cashByAccount: Record<string, number>
  ar: number; otherCurrentAssets: number; inventory: number; totalCurrentAssets: number
  ppeGross: number; accumulatedDepreciation: number; otherNonCurrentAssets: number; totalNonCurrentAssets: number
  totalAssets: number
  currentLiabilities: number; nonCurrentLiabilities: number; totalLiabilities: number
  openingEquity: number; netIncome: number; totalEquity: number
  totalLiabAndEquity: number; balanced: boolean; diff: number
}
interface IS {
  revenue: number; discounts: number; netSales: number
  cogs: number; grossProfit: number
  opex: number; ebitda: number; depreciation: number; otherExpense: number
  netIncome: number
  revenueByAccount: Record<string, number>
  expenseByAccount: Record<string, number>
}
interface CFIndirect {
  netIncome: number
  addBacks: { depreciation: number; otherNonCash: number }
  workingCapital: { deltaAR: number; deltaInventory: number; deltaAP: number; deltaAccruals: number; deltaUnearned: number }
  netCashFromOperations: number
  netCashFromInvesting: number
  netCashFromFinancing: number
  netChangeInCash: number
  openingCash: number; closingCash: number
  reconciliationGap: number; reconciled: boolean
  details: { investingPPE: number; investingOther: number; financingLongTermDebt: number; financingEquity: number }
}
interface ReportV2 {
  year: number; branch: string
  trialBalance: { balanced: boolean; diff: number; totals: TbTotals }
  balanceSheet: BS
  incomeStatement: IS
  cashFlow: { direct: { byMonth: Record<number, { in: number; out: number; net: number }>; netChange: number }; indirect: CFIndirect }
}

type Tab = 'balance-sheet' | 'income-statement' | 'cash-flow'
const TABS: { key: Tab; label: string; icon: typeof FileText }[] = [
  { key: 'balance-sheet',    label: 'Balance Sheet',       icon: FileText },
  { key: 'income-statement', label: 'Income Statement',    icon: BarChart3 },
  { key: 'cash-flow',        label: 'Cash Flow Statement', icon: LayoutList },
]
const BRANCHES = [
  { value: 'ALL', label: 'All Branches' },
  { value: 'SANDBOX_EAST', label: 'Sandbox East' },
  { value: 'SANDBOX_GREENHILLS', label: 'Sandbox Greenhills' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
]

const fmt = (n: number) => n === 0 ? '—' : formatCurrency(n)
const fmtSigned = (n: number) => n === 0 ? '—' : (n < 0 ? `(${formatCurrency(Math.abs(n))})` : formatCurrency(n))

function Row({ label, amount, indent = 0, bold = false, total = false, grand = false, negative = false }: {
  label: string; amount: number; indent?: number; bold?: boolean; total?: boolean; grand?: boolean; negative?: boolean
}) {
  const isNeg = negative && amount < 0
  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: '1fr 180px',
        padding: '4px 12px', paddingLeft: `${0.75 + indent * 1.2}rem`,
        fontSize: '0.75rem',
        fontWeight: grand || total || bold ? 600 : 400,
        borderTop:    grand ? '2px solid #111827' : total ? '1px solid #d1d5db' : undefined,
        borderBottom: grand ? '3px double #111827' : total ? '1px solid #d1d5db' : undefined,
        background:   grand ? '#f0f9f8' : undefined,
        color: '#111827',
      }}
    >
      <span>{label}</span>
      <span style={{ textAlign: 'right', fontFamily: 'inherit', color: isNeg ? '#dc2626' : '#111827' }}>
        {negative ? fmtSigned(amount) : fmt(amount)}
      </span>
    </div>
  )
}

function Section({ label }: { label: string }) {
  return (
    <div style={{ padding: '6px 12px', background: '#f0f2f4', borderTop: '1px solid #d1d5db', borderBottom: '1px solid #d1d5db', fontSize: '0.75rem', fontWeight: 700, color: '#111827', letterSpacing: '0.01em' }}>
      {label}
    </div>
  )
}

function CheckBanner({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className={`mb-2 rounded-lg px-4 py-2 text-sm flex items-center justify-between ${ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
      <span className="font-medium">{label} — {ok ? 'OK' : 'CHECK FAILED'}</span>
      <span className="font-mono text-xs">{detail}</span>
    </div>
  )
}

export default function ReportsV2Page() {
  const currentYear = new Date().getFullYear()
  const [year,   setYear]   = useState(currentYear)
  const [branch, setBranch] = useState('ALL')
  const [tab,    setTab]    = useState<Tab>('balance-sheet')
  const [data,   setData]   = useState<ReportV2 | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/v2?year=${year}&branch=${branch}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [year, branch])
  useEffect(() => { load() }, [load])

  const banners = useMemo(() => {
    if (!data) return null
    const tb  = data.trialBalance
    const bs  = data.balanceSheet
    const cf  = data.cashFlow.indirect
    return (
      <div className="px-4 pb-2">
        <CheckBanner label="Trial Balance"  ok={tb.balanced}    detail={`DR ${formatCurrency(tb.totals.closingDR)} ${tb.balanced ? '=' : '≠'} CR ${formatCurrency(tb.totals.closingCR)} (diff ${formatCurrency(tb.diff)})`} />
        <CheckBanner label="Balance Sheet"  ok={bs.balanced}    detail={`Assets ${formatCurrency(bs.totalAssets)} ${bs.balanced ? '=' : '≠'} L+E ${formatCurrency(bs.totalLiabAndEquity)} (diff ${formatCurrency(bs.diff)})`} />
        <CheckBanner label="Cash Flow recon" ok={cf.reconciled} detail={`Opening ${formatCurrency(cf.openingCash)} + Δ ${formatCurrency(cf.netChangeInCash)} ${cf.reconciled ? '=' : '≠'} Closing ${formatCurrency(cf.closingCash)} (gap ${formatCurrency(cf.reconciliationGap)})`} />
      </div>
    )
  }, [data])

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Reports (Tier 3 / v2)</h1>
          <p className="text-xs text-gray-600 mt-0.5">Derived from the General Ledger trial balance — every figure traceable to a balanced journal entry.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">
            <Calendar size={14} className="text-gray-500" />
            <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="text-sm bg-transparent outline-none">
              {Array.from({ length: 5 }, (_, i) => currentYear - i).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">
            <Building2 size={14} className="text-gray-500" />
            <select value={branch} onChange={e => setBranch(e.target.value)} className="text-sm bg-transparent outline-none">
              {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3 border-b border-gray-200">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${tab === t.key ? 'border-teal-600 text-teal-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <Icon size={14} />{t.label}
            </button>
          )
        })}
      </div>

      {loading || !data ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-teal-600" size={20} /></div>
      ) : (
        <>
          {banners}

          {tab === 'balance-sheet' && (
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <Section label="Assets" />
              <Row label="Cash and Cash Equivalents" amount={data.balanceSheet.cash} indent={1} bold />
              {Object.entries(data.balanceSheet.cashByAccount).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
                <Row key={k} label={k} amount={v} indent={2} negative />
              ))}
              <Row label="Accounts Receivable"      amount={data.balanceSheet.ar} indent={1} />
              <Row label="Inventory"                 amount={data.balanceSheet.inventory} indent={1} />
              <Row label="Other Current Assets"     amount={data.balanceSheet.otherCurrentAssets} indent={1} />
              <Row label="Total Current Assets"     amount={data.balanceSheet.totalCurrentAssets} indent={0} total bold />
              <Row label="PPE (gross)"               amount={data.balanceSheet.ppeGross} indent={1} />
              <Row label="Accumulated Depreciation" amount={data.balanceSheet.accumulatedDepreciation} indent={1} negative />
              <Row label="Other Non-Current Assets" amount={data.balanceSheet.otherNonCurrentAssets} indent={1} />
              <Row label="Total Non-Current Assets" amount={data.balanceSheet.totalNonCurrentAssets} indent={0} total bold />
              <Row label="TOTAL ASSETS"              amount={data.balanceSheet.totalAssets} grand />

              <div className="h-3" />
              <Section label="Liabilities" />
              <Row label="Current Liabilities"       amount={data.balanceSheet.currentLiabilities} indent={1} />
              <Row label="Non-Current Liabilities"   amount={data.balanceSheet.nonCurrentLiabilities} indent={1} />
              <Row label="TOTAL LIABILITIES"         amount={data.balanceSheet.totalLiabilities} grand />

              <div className="h-3" />
              <Section label="Equity" />
              <Row label="Opening Equity (Owner's + Retained)" amount={data.balanceSheet.openingEquity} indent={1} />
              <Row label="Net Income (Current Year)"           amount={data.balanceSheet.netIncome} indent={1} />
              <Row label="TOTAL EQUITY"                         amount={data.balanceSheet.totalEquity} grand />

              <div className="h-3" />
              <Row label="TOTAL LIABILITIES & EQUITY" amount={data.balanceSheet.totalLiabAndEquity} grand />
            </div>
          )}

          {tab === 'income-statement' && (
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <Section label="Revenue" />
              {Object.entries(data.incomeStatement.revenueByAccount).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
                <Row key={k} label={k} amount={v} indent={1} />
              ))}
              <Row label="Total Revenue"        amount={data.incomeStatement.revenue} indent={0} total bold />
              <Row label="Discounts & Refunds"  amount={-data.incomeStatement.discounts} indent={1} negative />
              <Row label="Net Sales"             amount={data.incomeStatement.netSales} grand />

              <div className="h-3" />
              <Section label="Cost of Sales" />
              <Row label="Total COGS"            amount={data.incomeStatement.cogs} indent={0} total bold />
              <Row label="Gross Profit"          amount={data.incomeStatement.grossProfit} grand />

              <div className="h-3" />
              <Section label="Operating Expenses" />
              {Object.entries(data.incomeStatement.expenseByAccount).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
                <Row key={k} label={k} amount={v} indent={1} />
              ))}
              <Row label="Total OPEX"             amount={data.incomeStatement.opex} indent={0} total bold />
              <Row label="EBITDA"                  amount={data.incomeStatement.ebitda} grand />

              <div className="h-3" />
              <Row label="Depreciation"            amount={data.incomeStatement.depreciation} indent={1} />
              <Row label="Other Expense"           amount={data.incomeStatement.otherExpense} indent={1} />
              <Row label="NET INCOME"              amount={data.incomeStatement.netIncome} grand />
            </div>
          )}

          {tab === 'cash-flow' && (
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <Section label="Cash Flow — Indirect Method" />
              <Row label="Net Income" amount={data.cashFlow.indirect.netIncome} indent={1} bold />
              <Row label="Add: Depreciation"           amount={data.cashFlow.indirect.addBacks.depreciation} indent={2} />
              <Row label="Add: Other Non-Cash"         amount={data.cashFlow.indirect.addBacks.otherNonCash} indent={2} />

              <div className="px-3 py-1.5 text-xs font-semibold uppercase text-gray-600">Working Capital Changes</div>
              <Row label="Δ Accounts Receivable"       amount={-data.cashFlow.indirect.workingCapital.deltaAR} indent={2} negative />
              <Row label="Δ Inventory"                 amount={-data.cashFlow.indirect.workingCapital.deltaInventory} indent={2} negative />
              <Row label="Δ Accounts Payable"          amount={data.cashFlow.indirect.workingCapital.deltaAP} indent={2} />
              <Row label="Δ Accrued Liabilities"       amount={data.cashFlow.indirect.workingCapital.deltaAccruals} indent={2} />
              <Row label="Δ Unearned Revenue"          amount={data.cashFlow.indirect.workingCapital.deltaUnearned} indent={2} />
              <Row label="Net Cash from Operations"    amount={data.cashFlow.indirect.netCashFromOperations} total bold />

              <div className="h-3" />
              <Section label="Investing Activities" />
              <Row label="Δ PPE (purchases)"           amount={data.cashFlow.indirect.details.investingPPE} indent={2} negative />
              <Row label="Δ Other Non-Current Assets"  amount={data.cashFlow.indirect.details.investingOther} indent={2} negative />
              <Row label="Net Cash from Investing"     amount={data.cashFlow.indirect.netCashFromInvesting} total bold />

              <div className="h-3" />
              <Section label="Financing Activities" />
              <Row label="Δ Long-Term Debt"            amount={data.cashFlow.indirect.details.financingLongTermDebt} indent={2} />
              <Row label="Δ Owner's Equity (excl. NI)" amount={data.cashFlow.indirect.details.financingEquity} indent={2} />
              <Row label="Net Cash from Financing"     amount={data.cashFlow.indirect.netCashFromFinancing} total bold />

              <div className="h-3" />
              <Row label="NET CHANGE IN CASH"          amount={data.cashFlow.indirect.netChangeInCash} grand />
              <Row label="Opening Cash"                amount={data.cashFlow.indirect.openingCash} indent={1} />
              <Row label="Closing Cash"                amount={data.cashFlow.indirect.closingCash} grand />
            </div>
          )}
        </>
      )}
    </div>
  )
}
