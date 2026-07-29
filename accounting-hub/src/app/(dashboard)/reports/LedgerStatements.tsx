'use client'

// Renders the Reports v2 (ledger-derived) statements — one balanced dataset,
// three interconnected statements, with an always-visible integrity strip.
import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { V2Statements, V2AccountRow } from '@/lib/reports/v2/engine'

function Amt({ v, bold }: { v: number; bold?: boolean }) {
  return (
    <span className="tabular-nums" style={{ color: v < 0 ? '#b91c1c' : '#111827', fontWeight: bold ? 600 : 400 }}>
      {v < 0 ? `(${formatCurrency(Math.abs(v)).replace('₱', '₱')})` : formatCurrency(v)}
    </span>
  )
}

function Row({ label, amount, indent = 0, bold, rule, doubleRule }: {
  label: string; amount?: number; indent?: number; bold?: boolean; rule?: boolean; doubleRule?: boolean
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-1 text-[0.8rem]"
      style={{
        paddingLeft: `${1 + indent * 1.25}rem`,
        borderTop: rule ? '1px solid #d1d5db' : undefined,
        borderBottom: doubleRule ? '3px double #111827' : undefined,
        background: doubleRule ? '#f9fafb' : undefined,
      }}
    >
      <span style={{ fontWeight: bold ? 600 : 400, color: '#111827' }}>{label}</span>
      {amount !== undefined && <Amt v={amount} bold={bold} />}
    </div>
  )
}

function SectionRows({ rows, movement }: { rows: V2AccountRow[]; movement?: boolean }) {
  return (
    <>
      {rows.map(r => (
        <Row key={r.number} label={`${r.number} ${r.title}${r.virtual ? ' *' : ''}`}
          amount={movement ? r.closing - r.opening : r.closing} indent={1} />
      ))}
    </>
  )
}

export default function LedgerStatements({ year, branch, tab }: {
  year: number
  branch: string
  tab: 'balance-sheet' | 'income-statement' | 'cash-flow'
}) {
  // Keyed result: loading is derived (result key ≠ current key), so the effect
  // never calls setState synchronously.
  const key = `${year}|${branch}`
  const [result, setResult] = useState<{ key: string; data: V2Statements | null; error: string | null }>({ key: '', data: null, error: null })

  useEffect(() => {
    let live = true
    fetch(`/api/reports/v2?year=${year}&branch=${branch}`)
      .then(async r => {
        const j = await r.json()
        if (!live) return
        if (!r.ok) setResult({ key, data: null, error: j.error || 'Failed to load' })
        else setResult({ key, data: j, error: null })
      })
      .catch(() => live && setResult({ key, data: null, error: 'Failed to load' }))
    return () => { live = false }
  }, [key, year, branch])

  const loading = result.key !== key
  const data = result.data
  const error = result.error

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin" size={22} style={{ color: 'var(--teal)' }} />
        <span className="ml-3 text-sm" style={{ color: 'var(--mid-gray)' }}>Deriving from the ledger…</span>
      </div>
    )
  }
  if (error || !data) {
    return <p className="px-6 py-10 text-sm text-center" style={{ color: 'var(--mid-gray)' }}>{error || 'No data'}</p>
  }

  const v = data.validation
  const checks: { ok: boolean; label: string }[] = [
    { ok: v.aEqualsLE, label: v.aEqualsLE ? 'A = L + E' : `A ≠ L + E (diff ${formatCurrency(Math.abs(v.aLEDiff))})` },
    { ok: v.cfTies, label: v.cfTies ? 'Cash flow ties' : 'Cash flow does not tie' },
    { ok: v.imbalancePlugs.length === 0, label: v.imbalancePlugs.length === 0 ? 'All entries balanced' : `${v.imbalancePlugs.length} source(s) plugged` },
    { ok: v.unclassified.length === 0, label: v.unclassified.length === 0 ? 'All accounts classified' : `${v.unclassified.length} unclassified account(s)` },
  ]

  const integrity = (
    <div className="mx-4 mt-3 mb-1 rounded-lg text-xs" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
        <span className="font-semibold" style={{ color: '#334155' }}>Ledger engine (beta)</span>
        {checks.map((c, i) => (
          <span key={i} className="flex items-center gap-1" style={{ color: c.ok ? '#15803d' : '#b45309' }}>
            {c.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{c.label}
          </span>
        ))}
      </div>
      {(v.synthesized.length > 0 || v.fromLedger.length > 0) && (
        <div className="px-3 pb-2" style={{ color: '#64748b' }}>
          From journal entries: {v.fromLedger.join(', ') || 'none'}
          {v.synthesized.length > 0 && <> · Synthesized (module not yet posting to GL): {v.synthesized.join(', ')}</>}
        </div>
      )}
      {Math.abs(v.openingPlug) >= 0.01 && (
        <div className="px-3 pb-2" style={{ color: '#b45309' }}>
          Opening balances don&apos;t balance by {formatCurrency(Math.abs(v.openingPlug))} — plugged to &quot;Opening Balance Equity&quot; (fix in Beginning Balances).
        </div>
      )}
      {v.unclassified.length > 0 && (
        <div className="px-3 pb-2" style={{ color: '#b45309' }}>
          Set a sub-type in Chart of Accounts for: {v.unclassified.map(u => `${u.number} ${u.title}`).join('; ')}
        </div>
      )}
      {v.notes.map((n, i) => (
        <div key={i} className="px-3 pb-2" style={{ color: '#64748b' }}>{n}</div>
      ))}
    </div>
  )

  let body: React.ReactNode = null
  if (tab === 'income-statement') {
    const is = data.incomeStatement
    const sec = (key: string) => is.sections.find(s => s.key === key)
    body = (
      <div className="py-1">
        {sec('REVENUE') && (<>
          <Row label="Gross Revenue" bold />
          <SectionRows rows={sec('REVENUE')!.rows} movement />
          <Row label="Total Gross Revenue" amount={sec('REVENUE')!.total} bold rule />
        </>)}
        {sec('DISCOUNTS') && (<>
          <Row label="Discounts and Refunds" bold />
          {sec('DISCOUNTS')!.rows.map(r => (
            <Row key={r.number} label={`${r.number} ${r.title}`} amount={-(r.closing - r.opening)} indent={1} />
          ))}
          <Row label="Total Discounts and Refunds" amount={-sec('DISCOUNTS')!.total} bold rule />
        </>)}
        <Row label="Net Sales" amount={is.netSales} bold doubleRule />
        {sec('COGS') && (<>
          <Row label="Cost of Sales" bold />
          <SectionRows rows={sec('COGS')!.rows} movement />
          <Row label="Total Cost of Sales" amount={is.totalCOGS} bold rule />
        </>)}
        <Row label="Gross Profit" amount={is.grossProfit} bold doubleRule />
        {sec('OPEX') && (<>
          <Row label="Operating Expenses" bold />
          <SectionRows rows={sec('OPEX')!.rows} movement />
          <Row label="Total Operating Expenses" amount={is.totalOpex} bold rule />
        </>)}
        <Row label="EBITDA" amount={is.ebitda} bold doubleRule />
        {is.depreciation !== 0 && <Row label="Depreciation" amount={is.depreciation} indent={1} />}
        {is.interest !== 0 && <Row label="Interest" amount={is.interest} indent={1} />}
        {is.nonOperating !== 0 && <Row label="Non-Operating Expenses" amount={is.nonOperating} indent={1} />}
        <Row label="EBT" amount={is.ebt} bold rule />
        <Row label="Provision for Income Tax (20%)" amount={is.taxProvision} indent={1} />
        <Row label="NET INCOME" amount={is.netIncome} bold doubleRule />
      </div>
    )
  } else if (tab === 'balance-sheet') {
    const bs = data.balanceSheet
    body = (
      <div className="py-1">
        {bs.sections.map(s => (
          <div key={s.key}>
            <Row label={s.label} bold />
            <SectionRows rows={s.rows} />
            {s.key === 'CURRENT_ASSETS' && bs.deferredTaxAsset > 0 && (
              <Row label="Deferred Tax Asset (20% provision on loss)" amount={bs.deferredTaxAsset} indent={1} />
            )}
            {s.key === 'CURRENT_LIABILITIES' && bs.incomeTaxPayable > 0 && (
              <Row label="Income Tax Payable (20% provision)" amount={bs.incomeTaxPayable} indent={1} />
            )}
            {s.key === 'EQUITY' && <Row label="Net Income (Current Year)" amount={bs.netIncome} indent={1} />}
            <Row label={`Total ${s.label}`} amount={
              s.total
              + (s.key === 'CURRENT_ASSETS' ? bs.deferredTaxAsset : 0)
              + (s.key === 'CURRENT_LIABILITIES' ? bs.incomeTaxPayable : 0)
              + (s.key === 'EQUITY' ? bs.netIncome : 0)
            } bold rule />
          </div>
        ))}
        <Row label="TOTAL ASSETS" amount={bs.totalAssets} bold doubleRule />
        <Row label="TOTAL LIABILITIES" amount={bs.totalLiabilities} bold />
        <Row label="TOTAL EQUITY" amount={bs.totalEquity} bold />
        <Row label="TOTAL LIABILITIES & EQUITY" amount={bs.totalLiabilities + bs.totalEquity} bold doubleRule />
      </div>
    )
  } else {
    const cf = data.cashFlow
    body = (
      <div className="py-1">
        <Row label="Cash Flows from Operating Activities" bold />
        <Row label="Net Income" amount={cf.netIncome} indent={1} bold />
        {cf.depreciation !== 0 && <Row label="Add: Depreciation (non-cash)" amount={cf.depreciation} indent={1} />}
        {cf.taxProvision !== 0 && <Row label="Add: Income tax provision (accrued, non-cash)" amount={cf.taxProvision} indent={1} />}
        {cf.workingCapital.map((w, i) => <Row key={i} label={w.label} amount={w.amount} indent={1} />)}
        <Row label="Net Cash from Operating Activities" amount={cf.netOperating} bold rule />
        <Row label="Cash Flows from Investing Activities" bold />
        {cf.investing.length === 0 && <Row label="(No investing activity)" amount={0} indent={1} />}
        {cf.investing.map((w, i) => <Row key={i} label={w.label} amount={w.amount} indent={1} />)}
        <Row label="Net Cash from Investing Activities" amount={cf.netInvesting} bold rule />
        <Row label="Cash Flows from Financing Activities" bold />
        {cf.financing.length === 0 && <Row label="(No financing activity)" amount={0} indent={1} />}
        {cf.financing.map((w, i) => <Row key={i} label={w.label} amount={w.amount} indent={1} />)}
        <Row label="Net Cash from Financing Activities" amount={cf.netFinancing} bold rule />
        <Row label="NET CHANGE IN CASH" amount={cf.netChange} bold doubleRule />
        <Row label="Beginning Cash" amount={cf.beginningCash} />
        {cf.cashAccounts.map((c, i) => <Row key={i} label={c.key} amount={c.amount} indent={1} />)}
        <Row label="ENDING CASH" amount={cf.endingCash} bold doubleRule />
      </div>
    )
  }

  return (
    <div className="pb-2">
      {integrity}
      {body}
      <p className="px-5 pt-2 text-[0.68rem]" style={{ color: '#9ca3af' }}>
        * derived account (not yet in the Chart of Accounts). All figures come from one balanced double-entry
        dataset: journal entries plus synthesized entries for modules that do not post to the ledger yet.
      </p>
    </div>
  )
}
