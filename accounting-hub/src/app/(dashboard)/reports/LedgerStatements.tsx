'use client'

// Renders the Reports v2 (ledger-derived) statements — one balanced dataset,
// three interconnected statements. Amounts are clickable (drill down to the
// underlying entries with Excel export), the Income Statement offers monthly /
// quarterly columns and a vertical-analysis mode (every line as % of gross
// revenue), and the integrity card sits at the bottom in plain language.
import { Fragment, useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Loader2, X, Download, ChevronDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { INCOME_TAX_RATE } from '@/lib/reports/income-statement-totals'
import type { V2Statements, V2AccountRow, V2CollectedLine } from '@/lib/reports/v2/engine'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']

// Plain-language names for entry sources (journal reference types + the
// engine's synthesized sources).
const SOURCE_LABELS: Record<string, string> = {
  'opening': 'Opening balance',
  'orders': 'POS sales (from orders)',
  'cogs': 'Cost of goods sold (from orders)',
  'ar-collections': 'HMO / guarantee-letter collections',
  'petty-cash': 'Petty cash expenses',
  'petty-cash-ceo': 'CEO petty cash (allocated to branches)',
  'prepaid-recurring': 'Prepaid expense amortization',
  'depreciation-schedule': 'Depreciation (asset schedule)',
  'asset-purchases': 'Asset purchases',
  'journal:manual': 'Manual journal entries',
  'journal:MANUAL': 'Manual journal entries',
  'journal:ADJUSTMENT': 'Manual adjustments',
  'journal:POS_ORDER': 'POS sales (posted to ledger)',
  'journal:FREE_SAMPLE': 'Free samples',
  'journal:AR_PAYMENT': 'HMO / guarantee-letter collections (posted)',
  'journal:AR_PAYMENT_REVERSAL': 'HMO / GL collection reversals',
  'journal:PAYROLL_CONSULTANT': 'Consultant payroll',
  'journal:PAYROLL_EMPLOYEE': 'Employee payroll',
  'journal:SALARY_PAYMENT': 'Salary payments',
  'journal:BENEFIT_PAYMENT': 'Government benefit remittances',
  'journal:TAX_OTHER_INCOME': 'Tax on other income',
  'journal:EWT_OTHER_INCOME': 'Expanded withholding tax',
  'journal:ASSET_PURCHASE': 'Asset purchases (posted)',
  'journal:ASSET_PURCHASE_REVERSAL': 'Asset purchase reversals',
  'journal:DEPRECIATION': 'Depreciation (posted)',
  'journal:INVENTORY_INCREASE': 'Inventory adjustments (increase)',
  'journal:INVENTORY_SHRINKAGE': 'Inventory adjustments (shrinkage)',
  'journal:INVENTORY_ADJUSTMENT_REVERSAL': 'Inventory adjustment reversals',
  'journal:REFUND_PAYMENT': 'Patient refunds',
  'journal:CASH_ADVANCE': 'Cash advances',
  'journal:CASH_ADVANCE_LIQ': 'Cash advance liquidations',
  'journal:CASH_ADVANCE_RETURN': 'Cash advance returns',
  'journal:CASH_ADVANCE_REIMBURSE': 'Cash advance reimbursements',
  'journal:LOAN': 'Loans released',
  'journal:LOAN_PAYMENT': 'Loan payments',
  'journal:ADVANCE': 'Advances released',
  'journal:ADVANCE_PAYMENT': 'Advance payments',
  'journal:CREDIT_LINE_SETTLE': 'Credit line settlements',
  'journal:EQUITY_COMMON': 'Common share issuance',
  'journal:EQUITY_PREFERRED': 'Preferred share issuance',
  'journal:EQUITY_BUYBACK': 'Share buybacks',
  'journal:DIVIDEND_PREFERRED': 'Preferred dividends',
  'journal:SCHOLAR_RELEASE': 'Scholarship releases',
  'journal:APPROP': 'Scholarship fund appropriations',
  'journal:BANK_REC': 'Bank reconciliation postings',
  'journal:PAYMONGO_SALE': 'PayMongo sales',
  'journal:PAYMONGO_FEE': 'PayMongo fees',
  'journal:PAYMONGO_PAYOUT': 'PayMongo payouts',
  'journal:TIKTOK_SETTLEMENT': 'TikTok settlements',
  'journal:TIKTOK_WHT': 'TikTok withholding tax',
}
const sourceLabel = (s: string) => SOURCE_LABELS[s]
  || s.replace(/^journal:/, '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())

/** Historical ledger labels/descriptions were stored with the pre-rebrand branch codes — sanitize at display time only. */
const rebrand = (s: string) => s.replace(/\bSBEA\b/g, 'AHEA').replace(/\bSBGH\b/g, 'AHGH')

const fmtAmt = (v: number) => (v < 0 ? `(${formatCurrency(Math.abs(v))})` : formatCurrency(v))
const fmtPct = (v: number, base: number) => (Math.abs(base) < 0.005 ? '—' : `${(v / base * 100).toFixed(1)}%`)

function Amt({ v, bold, onClick, pctBase }: { v: number; bold?: boolean; onClick?: () => void; pctBase?: number | null }) {
  // Vertical analysis keeps the amount and appends the % beside it,
  // in bright blue so it stands out: ₱454,534.91 (11.9%)
  const usePct = pctBase !== undefined && pctBase !== null
  return (
    <span
      className={`tabular-nums${onClick ? ' cursor-pointer hover:underline' : ''}`}
      style={{ color: v < 0 ? '#b91c1c' : '#111827', fontWeight: bold ? 600 : 400 }}
      onClick={onClick}
    >
      {fmtAmt(v)}
      {usePct && (
        <span style={{ color: '#2563eb', fontWeight: 600, marginLeft: 4 }}>({fmtPct(v, pctBase)})</span>
      )}
    </span>
  )
}

function Row({ label, amount, indent = 0, bold, rule, doubleRule, muted, onClick, pctBase }: {
  label: React.ReactNode; amount?: number; indent?: number; bold?: boolean; rule?: boolean; doubleRule?: boolean
  muted?: boolean; onClick?: () => void; pctBase?: number | null
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-1 text-[0.8rem] hover:bg-gray-50"
      style={{
        paddingLeft: `${1 + indent * 1.25}rem`,
        borderTop: rule ? '1px solid #d1d5db' : undefined,
        // Thin separator on plain line items so the eye can track a label to
        // its amount across the full row width.
        borderBottom: doubleRule ? '3px double #111827' : rule || bold ? undefined : '1px solid #f3f4f6',
        background: doubleRule ? '#f9fafb' : undefined,
        fontStyle: muted ? 'italic' : undefined,
        color: muted ? '#6b7280' : undefined,
      }}
    >
      <span style={{ fontWeight: bold ? 600 : 400, color: muted ? '#6b7280' : '#111827' }}>{label}</span>
      {amount !== undefined && <Amt v={amount} bold={bold} onClick={onClick} pctBase={pctBase} />}
    </div>
  )
}

/* ── Multi-column (monthly / quarterly) income-statement table ──── */

function MultiCells({ values, total, bold, onClickCell, pctBases, pctBaseTotal }: {
  values: number[]; total: number; bold?: boolean; onClickCell?: (m: number | null) => void
  pctBases?: number[] | null; pctBaseTotal?: number | null
}) {
  return (
    <>
      {values.map((v, i) => (
        <td key={i} className="px-2 py-1 text-right whitespace-nowrap">
          {Math.abs(v) >= 0.005
            ? <Amt v={v} bold={bold} onClick={onClickCell ? () => onClickCell(i + 1) : undefined} pctBase={pctBases ? pctBases[i] : undefined} />
            : <span style={{ color: '#d1d5db' }}>—</span>}
        </td>
      ))}
      <td className="px-2 py-1 text-right whitespace-nowrap" style={{ borderLeft: '1px solid #e5e7eb' }}>
        <Amt v={total} bold={bold} onClick={onClickCell ? () => onClickCell(null) : undefined} pctBase={pctBaseTotal} />
      </td>
    </>
  )
}

function MultiRow({ label, indent, bold, rule, doubleRule, muted, ...cells }: {
  label: React.ReactNode; values: number[]; total: number; indent?: number; bold?: boolean; rule?: boolean
  doubleRule?: boolean; muted?: boolean; onClickCell?: (m: number | null) => void
  pctBases?: number[] | null; pctBaseTotal?: number | null
}) {
  return (
    <tr className="hover:bg-gray-50" style={{
      borderTop: rule ? '1px solid #d1d5db' : undefined,
      borderBottom: doubleRule ? '3px double #111827' : rule || bold ? undefined : '1px solid #f3f4f6',
      background: doubleRule ? '#f9fafb' : undefined,
      fontStyle: muted ? 'italic' : undefined,
      color: muted ? '#6b7280' : undefined,
    }}>
      <td className="px-3 py-1 whitespace-nowrap" style={{ paddingLeft: indent ? `${1 + indent * 1.25}rem` : undefined, fontWeight: bold ? 600 : 400 }}>
        {label}
      </td>
      <MultiCells {...cells} bold={bold} />
    </tr>
  )
}

/* ── Drill-down modal ───────────────────────────────────────────── */

function DrillDown({ year, branch, account, title, month, onClose }: {
  year: number; branch: string; account: string; title: string; month: number | null; onClose: () => void
}) {
  const [lines, setLines] = useState<V2CollectedLine[] | null>(null)
  const [totals, setTotals] = useState<{ debit: number; credit: number } | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const params = new URLSearchParams({ year: String(year), branch, account })
    if (month) params.set('month', String(month))
    fetch(`/api/reports/v2?${params}`)
      .then(async r => {
        const j = await r.json()
        if (!live) return
        if (!r.ok) setError(j.error || 'Failed to load')
        else {
          setLines(j.collected || [])
          setTotals(j.collectedTotals || null)
          setTruncated(!!j.collectedTruncated)
        }
      })
      .catch(() => live && setError('Failed to load'))
    return () => { live = false }
  }, [year, branch, account, month])

  // Exact sums come from the engine (correct even when the list is capped);
  // fall back to summing the visible lines.
  const sumDebit = totals?.debit ?? (lines || []).reduce((s, l) => s + l.debit, 0)
  const sumCredit = totals?.credit ?? (lines || []).reduce((s, l) => s + l.credit, 0)
  const net = sumDebit - sumCredit

  const downloadExcel = () => {
    if (!lines) return
    const rows: string[][] = [
      [title, month ? MONTHS[month - 1] : 'Whole year', String(year), branch],
      [],
      ['Month', 'Source', 'Detail', 'Debit', 'Credit'],
      ...lines.map(l => [
        l.month === 0 ? 'Opening' : MONTHS[l.month - 1],
        sourceLabel(l.source),
        rebrand(l.label),
        l.debit ? l.debit.toFixed(2) : '',
        l.credit ? l.credit.toFixed(2) : '',
      ]),
      ['Totals', '', '', sumDebit.toFixed(2), sumCredit.toFixed(2)],
      ['Net (debits − credits)', '', '', '', net.toFixed(2)],
      ...(truncated ? [[`Note: list shows the first ${lines.length} entries — totals cover every entry.`]] : []),
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${account}-${year}-${branch}${month ? '-' + MONTHS[month - 1] : ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col" style={{ background: 'white' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4" style={{ borderBottom: '1px solid #e5e7eb' }}>
          <div>
            <p className="font-semibold" style={{ color: '#111827' }}>{title}</p>
            <p className="text-xs" style={{ color: '#6b7280' }}>
              {month ? MONTHS[month - 1] : 'Whole year'} · every underlying entry, from the ledger dataset
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadExcel}
              disabled={!lines || lines.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
              style={{ background: 'var(--charcoal, #1f2937)', color: 'white' }}
            >
              <Download size={13} /> Download Excel
            </button>
            <button onClick={onClose}><X size={18} style={{ color: '#6b7280' }} /></button>
          </div>
        </div>
        <div className="overflow-y-auto px-2 py-2">
          {!lines && !error && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} />
            </div>
          )}
          {error && <p className="px-4 py-8 text-sm text-center" style={{ color: '#b91c1c' }}>{error}</p>}
          {lines && lines.length === 0 && (
            <p className="px-4 py-8 text-sm text-center" style={{ color: '#6b7280' }}>No entries for this selection.</p>
          )}
          {lines && lines.length > 0 && (
            <table className="w-full text-[0.78rem]">
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th className="px-3 py-1.5 text-left font-semibold" style={{ color: '#374151' }}>Month</th>
                  <th className="px-3 py-1.5 text-left font-semibold" style={{ color: '#374151' }}>Source</th>
                  <th className="px-3 py-1.5 text-left font-semibold" style={{ color: '#374151' }}>Detail</th>
                  <th className="px-2 py-1.5 text-right font-semibold" style={{ color: '#374151' }}>Debit</th>
                  <th className="px-2 py-1.5 text-right font-semibold" style={{ color: '#374151' }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td className="px-3 py-1 whitespace-nowrap" style={{ color: '#6b7280' }}>{l.month === 0 ? 'Opening' : MONTHS[l.month - 1]}</td>
                    <td className="px-3 py-1 whitespace-nowrap" style={{ color: '#374151' }}>{sourceLabel(l.source)}</td>
                    <td className="px-3 py-1" style={{ color: '#111827' }}>{rebrand(l.label)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{l.debit ? formatCurrency(l.debit) : ''}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{l.credit ? formatCurrency(l.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {truncated && (
                  <tr>
                    <td colSpan={5} className="px-3 py-1.5 text-xs italic" style={{ color: '#b45309' }}>
                      Showing the first {lines.length.toLocaleString()} entries — the totals below still cover every entry.
                    </td>
                  </tr>
                )}
                <tr style={{ borderTop: '1px solid #d1d5db' }}>
                  <td colSpan={3} className="px-3 py-1.5 font-semibold" style={{ color: '#111827' }}>Totals</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums" style={{ color: '#111827' }}>{sumDebit ? formatCurrency(sumDebit) : ''}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums" style={{ color: '#111827' }}>{sumCredit ? formatCurrency(sumCredit) : ''}</td>
                </tr>
                {sumDebit > 0.005 && sumCredit > 0.005 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-1 text-right" style={{ color: '#6b7280' }}>Net (debits − credits)</td>
                    <td className="px-2 py-1 text-right font-semibold tabular-nums" style={{ color: '#111827' }}>{fmtAmt(net)}</td>
                  </tr>
                )}
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Main component ─────────────────────────────────────────────── */

export default function LedgerStatements({ year, branch, tab, view }: {
  year: number
  branch: string
  tab: 'balance-sheet' | 'income-statement' | 'cash-flow'
  view: 'annual' | 'quarterly' | 'monthly'
}) {
  // Keyed result: loading is derived (result key ≠ current key), so the effect
  // never calls setState synchronously.
  const key = `${year}|${branch}`
  const [result, setResult] = useState<{ key: string; data: V2Statements | null; error: string | null }>({ key: '', data: null, error: null })
  const [drill, setDrill] = useState<{ account: string; title: string; month: number | null } | null>(null)
  const [verticalAnalysis, setVerticalAnalysis] = useState(false)
  // 7080 Sales of Product Income category breakdown — collapsed by default.
  const [show7080Breakdown, setShow7080Breakdown] = useState(false)

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

  const openDrill = (r: { number: string; title: string }, month: number | null = null) =>
    setDrill({ account: r.number, title: `${r.number} ${r.title}`, month })

  const v = data.validation
  const checks: { ok: boolean; label: string }[] = [
    { ok: v.aEqualsLE, label: v.aEqualsLE ? 'Assets = Liabilities + Equity' : `Assets ≠ Liabilities + Equity (off by ${formatCurrency(Math.abs(v.aLEDiff))})` },
    { ok: v.cfTies, label: v.cfTies ? 'Cash flow ties to the balance sheet' : 'Cash flow does not tie' },
    { ok: v.imbalancePlugs.length === 0, label: v.imbalancePlugs.length === 0 ? 'Every entry balanced' : `${v.imbalancePlugs.length} source(s) had unbalanced entries` },
    { ok: v.unclassified.length === 0, label: v.unclassified.length === 0 ? 'Every account classified' : `${v.unclassified.length} account(s) need a sub-type` },
  ]

  // Integrity card — bottom of the statement, plain language.
  const integrity = (
    <div className="mx-4 mt-4 mb-2 rounded-lg text-xs" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
        <span className="font-semibold" style={{ color: '#334155' }}>Ledger engine (beta) — health checks</span>
        {checks.map((c, i) => (
          <span key={i} className="flex items-center gap-1" style={{ color: c.ok ? '#15803d' : '#b45309' }}>
            {c.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{c.label}
          </span>
        ))}
      </div>
      {v.imbalancePlugs.length > 0 && (
        <div className="px-3 pb-2" style={{ color: '#b45309' }}>
          <span className="font-semibold">Entries that didn&apos;t balance</span> (their difference is parked on the visible
          &quot;Derivation Imbalance&quot; line in Equity — click it to see each entry):{' '}
          {v.imbalancePlugs.map((p, i) => (
            <span key={i}>
              {i > 0 && '; '}
              <span className="cursor-pointer underline" onClick={() => setDrill({ account: '9990', title: `Derivation Imbalance — ${sourceLabel(p.source)}`, month: null })}>
                {sourceLabel(p.source)}: {fmtAmt(p.amount)}
              </span>
            </span>
          ))}
        </div>
      )}
      {v.unclassified.length > 0 && (
        <div className="px-3 pb-2" style={{ color: '#b45309' }}>
          <span className="font-semibold">Accounts needing a sub-type</span> (open Chart of Accounts and set one so they
          land in the right section): {v.unclassified.map(u => `${u.number} ${u.title}`).join('; ')}
        </div>
      )}
      {Math.abs(v.openingPlug) >= 0.01 && (
        <div className="px-3 pb-2" style={{ color: '#b45309' }}>
          Opening balances don&apos;t balance by {formatCurrency(Math.abs(v.openingPlug))} — parked in &quot;Opening Balance
          Equity&quot; (fix in Beginning Balances).
        </div>
      )}
      <div className="px-3 pb-2" style={{ color: '#64748b' }}>
        <span className="font-semibold">Where the figures come from:</span>{' '}
        {v.fromLedger.length > 0 && <>posted journal entries — {v.fromLedger.map(t => sourceLabel(`journal:${t}`)).join(', ')}. </>}
        {v.synthesized.length > 0 && (
          <>Derived directly from module records (not yet posting to the ledger) — {v.synthesized.map(s => {
            const m = s.match(/^([a-z-]+)(?:\s*\((\d+)\))?$/)
            return m ? `${sourceLabel(m[1])}${m[2] ? ` (${m[2]})` : ''}` : s
          }).join(', ')}.</>
        )}
      </div>
      {v.notes.map((n, i) => (
        <div key={i} className="px-3 pb-2" style={{ color: '#64748b' }}>{n}</div>
      ))}
    </div>
  )

  let body: React.ReactNode = null
  if (tab === 'income-statement') {
    const is = data.incomeStatement
    const sec = (key: string) => is.sections.find(s => s.key === key)
    const multiCol = view !== 'annual'
    const colLabels = view === 'quarterly' ? QUARTERS : MONTHS
    // Fold Jan..Dec into the selected column granularity.
    const toCols = (m12: number[]) => view === 'quarterly'
      ? [0, 1, 2, 3].map(q => (m12[q * 3] || 0) + (m12[q * 3 + 1] || 0) + (m12[q * 3 + 2] || 0))
      : m12
    // Column click → month filter (monthly view only; a quarter spans months,
    // so quarterly cells drill to the whole year).
    const cellMonth = (i: number | null): number | null => (view === 'monthly' ? i : null)
    const secCols = (key: string) => {
      const s = sec(key)
      const m12 = Array.from({ length: 12 }, (_, i) => (s?.rows || []).reduce((sum, r) => sum + (r.monthly?.[i] || 0), 0))
      return toCols(m12)
    }
    const revC = secCols('REVENUE'), discC = secCols('DISCOUNTS'), cogsC = secCols('COGS'), opexC = secCols('OPEX')
    const depC = secCols('DEPRECIATION'), intC = secCols('INTEREST'), nonopC = secCols('NON_OPERATING')
    const netSalesC = revC.map((r, i) => r - discC[i])
    const ebitdaC = netSalesC.map((n, i) => n - cogsC[i] - opexC[i])
    const ebtC = ebitdaC.map((e, i) => e - depC[i] - intC[i] - nonopC[i])
    const grossTotal = revC.reduce((a, b) => a + b, 0)
    // Vertical analysis: every line as % of gross revenue for its column/period.
    const vaBases = verticalAnalysis ? revC : null
    const vaTotal = verticalAnalysis ? grossTotal : null
    const rowVals = (r: V2AccountRow, negate = false) => {
      const cols = toCols(r.monthly || Array(12).fill(0)).map(x => (negate ? -x : x))
      return { values: cols, total: cols.reduce((s, x) => s + x, 0) }
    }
    const annualVal = (r: V2AccountRow) => r.closing - r.opening

    const vaToggle = (
      <label className="flex items-center gap-2 px-4 py-2 text-xs cursor-pointer select-none" style={{ color: '#374151' }}>
        <input type="checkbox" checked={verticalAnalysis} onChange={e => setVerticalAnalysis(e.target.checked)} />
        Vertical Analysis — show every line as a % of total gross revenue for the {view === 'annual' ? 'period' : view === 'quarterly' ? 'quarter' : 'month'}
      </label>
    )

    // 7080 sub-classification rows (Department · Category) — collapsible via a
    // chevron on the 7080 line, hidden by default.
    const total7080 = is.productSubtypes.reduce((s, p) => s + p.total, 0)
    const subtypeRows = (renderRow: (p: { label: string; monthly: number[]; total: number }, mix: string) => React.ReactNode) =>
      show7080Breakdown ? is.productSubtypes.map(p => renderRow(p, total7080 ? `${Math.round(p.total / total7080 * 100)}%` : '—')) : null
    const rowLabel = (r: V2AccountRow) => {
      const text = `${r.number} ${r.title}${r.virtual ? ' *' : ''}`
      if (r.number !== '7080' || is.productSubtypes.length === 0) return text
      return (
        <span className="inline-flex items-center gap-1 cursor-pointer select-none" onClick={() => setShow7080Breakdown(s => !s)}
          title={show7080Breakdown ? 'Hide category breakdown' : 'Show category breakdown'}>
          <ChevronDown size={12} style={{ color: '#6b7280', transition: 'transform 0.15s', transform: show7080Breakdown ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
          {text}
        </span>
      )
    }

    if (multiCol) {
      body = (
        <div className="py-1">
          {vaToggle}
          {/* Contained scroll area so the column headers stay pinned while
              scrolling long statements (sticky needs the scrolling ancestor). */}
          <div className="overflow-auto" style={{ maxHeight: '75vh' }}>
            <table className="w-full text-[0.75rem]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th className="px-3 py-1.5 text-left font-semibold" style={{ color: '#374151', position: 'sticky', top: 0, zIndex: 2, background: 'white', boxShadow: 'inset 0 -2px 0 #e5e7eb' }}>Line Item</th>
                  {colLabels.map(m => <th key={m} className="px-2 py-1.5 text-right font-semibold" style={{ color: '#374151', position: 'sticky', top: 0, zIndex: 2, background: 'white', boxShadow: 'inset 0 -2px 0 #e5e7eb' }}>{m}</th>)}
                  <th className="px-2 py-1.5 text-right font-semibold" style={{ color: '#374151', borderLeft: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 2, background: 'white', boxShadow: 'inset 0 -2px 0 #e5e7eb' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {sec('REVENUE') && (<>
                  <tr><td colSpan={colLabels.length + 2} className="px-3 pt-2 pb-1 font-semibold text-[0.72rem] uppercase" style={{ color: '#111827' }}>Gross Revenue</td></tr>
                  {sec('REVENUE')!.rows.map(r => (<>
                    <MultiRow key={r.number} label={rowLabel(r)} indent={1} {...rowVals(r)}
                      onClickCell={m => openDrill(r, cellMonth(m))} pctBases={vaBases} pctBaseTotal={vaTotal} />
                    {r.number === '7080' && subtypeRows((p, mix) => {
                      const cols = toCols(p.monthly)
                      return <MultiRow key={`sub-${p.label}`} label={`${p.label} (${mix})`} indent={2} muted
                        values={cols} total={p.total} pctBases={vaBases} pctBaseTotal={vaTotal} />
                    })}
                  </>))}
                  <MultiRow label="Total Gross Revenue" values={revC} total={grossTotal} bold rule pctBases={vaBases} pctBaseTotal={vaTotal} />
                </>)}
                {sec('DISCOUNTS') && (<>
                  <tr><td colSpan={colLabels.length + 2} className="px-3 pt-2 pb-1 font-semibold text-[0.72rem] uppercase" style={{ color: '#111827' }}>Discounts and Refunds</td></tr>
                  {sec('DISCOUNTS')!.rows.map(r => {
                    const rv = rowVals(r, true)
                    return <MultiRow key={r.number} label={`${r.number} ${r.title}`} indent={1} {...rv}
                      onClickCell={m => openDrill(r, cellMonth(m))} pctBases={vaBases} pctBaseTotal={vaTotal} />
                  })}
                </>)}
                <MultiRow label="Net Sales" values={netSalesC} total={is.netSales} bold doubleRule pctBases={vaBases} pctBaseTotal={vaTotal} />
                {sec('COGS') && (<>
                  <tr><td colSpan={colLabels.length + 2} className="px-3 pt-2 pb-1 font-semibold text-[0.72rem] uppercase" style={{ color: '#111827' }}>Cost of Sales</td></tr>
                  {sec('COGS')!.rows.map(r => (
                    <MultiRow key={r.number} label={`${r.number} ${r.title}`} indent={1} {...rowVals(r)} onClickCell={m => openDrill(r, cellMonth(m))} pctBases={vaBases} pctBaseTotal={vaTotal} />
                  ))}
                </>)}
                <MultiRow label="Gross Profit" values={netSalesC.map((n, i) => n - cogsC[i])} total={is.grossProfit} bold doubleRule pctBases={vaBases} pctBaseTotal={vaTotal} />
                {sec('OPEX') && (<>
                  <tr><td colSpan={colLabels.length + 2} className="px-3 pt-2 pb-1 font-semibold text-[0.72rem] uppercase" style={{ color: '#111827' }}>Operating Expenses</td></tr>
                  {sec('OPEX')!.rows.map(r => (
                    <MultiRow key={r.number} label={`${r.number} ${r.title}`} indent={1} {...rowVals(r)} onClickCell={m => openDrill(r, cellMonth(m))} pctBases={vaBases} pctBaseTotal={vaTotal} />
                  ))}
                </>)}
                <MultiRow label="EBITDA" values={ebitdaC} total={is.ebitda} bold doubleRule pctBases={vaBases} pctBaseTotal={vaTotal} />
                {(['DEPRECIATION', 'INTEREST', 'NON_OPERATING'] as const).map(k => sec(k) && sec(k)!.rows.map(r => (
                  <MultiRow key={r.number} label={`${r.number} ${r.title}`} indent={1} {...rowVals(r)} onClickCell={m => openDrill(r, cellMonth(m))} pctBases={vaBases} pctBaseTotal={vaTotal} />
                )))}
                <MultiRow label="EBT" values={ebtC} total={is.ebt} bold rule pctBases={vaBases} pctBaseTotal={vaTotal} />
                <MultiRow label="Provision for Income Tax (20%)" indent={1}
                  values={ebtC.map(e => e * INCOME_TAX_RATE)} total={is.taxProvision} pctBases={vaBases} pctBaseTotal={vaTotal} />
                <MultiRow label="NET INCOME" values={ebtC.map(e => e * (1 - INCOME_TAX_RATE))} total={is.netIncome} bold doubleRule pctBases={vaBases} pctBaseTotal={vaTotal} />
              </tbody>
            </table>
          </div>
        </div>
      )
    } else {
      const vaBase = verticalAnalysis ? grossTotal : null
      body = (
        <div className="py-1">
          {vaToggle}
          {sec('REVENUE') && (<>
            <Row label="Gross Revenue" bold />
            {sec('REVENUE')!.rows.map(r => (<div key={r.number}>
              <Row label={rowLabel(r)}
                amount={annualVal(r)} indent={1} onClick={() => openDrill(r)} pctBase={vaBase} />
              {r.number === '7080' && subtypeRows((p, mix) => (
                <Row key={`sub-${p.label}`} label={`${p.label} (${mix})`} amount={p.total} indent={2} muted pctBase={vaBase} />
              ))}
            </div>))}
            <Row label="Total Gross Revenue" amount={sec('REVENUE')!.total} bold rule pctBase={vaBase} />
          </>)}
          {sec('DISCOUNTS') && (<>
            <Row label="Discounts and Refunds" bold />
            {sec('DISCOUNTS')!.rows.map(r => (
              <Row key={r.number} label={`${r.number} ${r.title}`} amount={-annualVal(r)} indent={1} onClick={() => openDrill(r)} pctBase={vaBase} />
            ))}
            <Row label="Total Discounts and Refunds" amount={-sec('DISCOUNTS')!.total} bold rule pctBase={vaBase} />
          </>)}
          <Row label="Net Sales" amount={is.netSales} bold doubleRule pctBase={vaBase} />
          {sec('COGS') && (<>
            <Row label="Cost of Sales" bold />
            {sec('COGS')!.rows.map(r => (
              <Row key={r.number} label={`${r.number} ${r.title}${r.virtual ? ' *' : ''}`} amount={annualVal(r)} indent={1} onClick={() => openDrill(r)} pctBase={vaBase} />
            ))}
            <Row label="Total Cost of Sales" amount={is.totalCOGS} bold rule pctBase={vaBase} />
          </>)}
          <Row label="Gross Profit" amount={is.grossProfit} bold doubleRule pctBase={vaBase} />
          {sec('OPEX') && (<>
            <Row label="Operating Expenses" bold />
            {sec('OPEX')!.rows.map(r => (
              <Row key={r.number} label={`${r.number} ${r.title}${r.virtual ? ' *' : ''}`} amount={annualVal(r)} indent={1} onClick={() => openDrill(r)} pctBase={vaBase} />
            ))}
            <Row label="Total Operating Expenses" amount={is.totalOpex} bold rule pctBase={vaBase} />
          </>)}
          <Row label="EBITDA" amount={is.ebitda} bold doubleRule pctBase={vaBase} />
          {(['DEPRECIATION', 'INTEREST', 'NON_OPERATING'] as const).map(k => sec(k)?.rows.map(r => (
            <Row key={r.number} label={`${r.number} ${r.title}`} amount={annualVal(r)} indent={1} onClick={() => openDrill(r)} pctBase={vaBase} />
          )))}
          <Row label="EBT" amount={is.ebt} bold rule pctBase={vaBase} />
          <Row label="Provision for Income Tax (20%)" amount={is.taxProvision} indent={1} pctBase={vaBase} />
          <Row label="NET INCOME" amount={is.netIncome} bold doubleRule pctBase={vaBase} />
        </div>
      )
    }
  } else if (tab === 'balance-sheet') {
    const bs = data.balanceSheet
    if (view !== 'annual') {
      // Month-end (or quarter-end) POSITIONS: engine sends cumulative
      // statement-signed balances in `monthly` for balance-sheet rows.
      const colLabels = view === 'quarterly' ? QUARTERS : MONTHS
      const colIdx = view === 'quarterly' ? [2, 5, 8, 11] : Array.from({ length: 12 }, (_, i) => i)
      const pick = (m12: number[]) => colIdx.map(i => m12[i] || 0)
      // cumulative EBT per month → monthly NI / ITP / DTA (statement-signed)
      const isSec = (key: string) => data.incomeStatement.sections.find(s => s.key === key)
      const mvSum = (key: string) => Array.from({ length: 12 }, (_, i) => (isSec(key)?.rows || []).reduce((s, r) => s + (r.monthly?.[i] || 0), 0))
      const revM = mvSum('REVENUE'), discM = mvSum('DISCOUNTS'), cogsM = mvSum('COGS'), opexM = mvSum('OPEX')
      const depM = mvSum('DEPRECIATION'), intM = mvSum('INTEREST'), nonopM = mvSum('NON_OPERATING')
      let run = 0
      const cumEbt = Array.from({ length: 12 }, (_, i) => {
        run += revM[i] - discM[i] - cogsM[i] - opexM[i] - depM[i] - intM[i] - nonopM[i]
        return run
      })
      const niCum = cumEbt.map(e => e * (1 - INCOME_TAX_RATE))
      const itpCum = cumEbt.map(e => (e > 0 ? e * INCOME_TAX_RATE : 0))
      const dtaCum = cumEbt.map(e => (e < 0 ? -e * INCOME_TAX_RATE : 0))
      const secMonthly = (s: (typeof bs.sections)[number]) =>
        Array.from({ length: 12 }, (_, i) => s.rows.reduce((sum, r) => sum + (r.monthly?.[i] || 0), 0))
      const assetsM = Array.from({ length: 12 }, (_, i) =>
        bs.sections.filter(s => s.key.includes('ASSETS')).reduce((sum, s) => sum + secMonthly(s)[i], 0) + dtaCum[i])
      const liabM = Array.from({ length: 12 }, (_, i) =>
        bs.sections.filter(s => s.key.includes('LIABILITIES')).reduce((sum, s) => sum + secMonthly(s)[i], 0) + itpCum[i])
      const equityM = Array.from({ length: 12 }, (_, i) =>
        bs.sections.filter(s => s.key === 'EQUITY').reduce((sum, s) => sum + secMonthly(s)[i], 0) + niCum[i])
      body = (
        <div className="py-1">
          <p className="text-xs italic px-4 py-2" style={{ color: 'var(--mid-gray)' }}>
            Position at each {view === 'quarterly' ? 'quarter' : 'month'} end — the Total column is the year-end position.
          </p>
          <div className="overflow-auto" style={{ maxHeight: '75vh' }}>
            <table className="w-full text-[0.75rem]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Line Item', ...colLabels, 'Year End'].map((m, i) => (
                    <th key={m} className={`px-2 py-1.5 font-semibold ${i === 0 ? 'text-left px-3' : 'text-right'}`}
                      style={{ color: '#374151', position: 'sticky', top: 0, zIndex: 2, background: 'white', boxShadow: 'inset 0 -2px 0 #e5e7eb', ...(m === 'Year End' ? { borderLeft: '1px solid #e5e7eb' } : {}) }}>{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bs.sections.map(s => (<Fragment key={s.key}>
                  <tr><td colSpan={colLabels.length + 2} className="px-3 pt-2 pb-1 font-semibold text-[0.72rem] uppercase" style={{ color: '#111827' }}>{s.label}</td></tr>
                  {s.rows.map(r => (
                    <MultiRow key={r.number} label={`${r.number} ${r.title}${r.virtual ? ' *' : ''}`} indent={1}
                      values={pick(r.monthly || [])} total={r.closing}
                      onClickCell={m => openDrill(r, view === 'monthly' ? m : null)} />
                  ))}
                  {s.key === 'CURRENT_ASSETS' && bs.deferredTaxAsset > 0 && (
                    <MultiRow label="Deferred Tax Asset (20% provision on loss)" indent={1} values={pick(dtaCum)} total={bs.deferredTaxAsset} />
                  )}
                  {s.key === 'CURRENT_LIABILITIES' && bs.incomeTaxPayable > 0 && (
                    <MultiRow label="Income Tax Payable (20% provision)" indent={1} values={pick(itpCum)} total={bs.incomeTaxPayable} />
                  )}
                  {s.key === 'EQUITY' && <MultiRow label="Net Income (Cumulative)" indent={1} values={pick(niCum)} total={bs.netIncome} />}
                </Fragment>))}
                <MultiRow label="TOTAL ASSETS" values={pick(assetsM)} total={bs.totalAssets} bold doubleRule />
                <MultiRow label="TOTAL LIABILITIES" values={pick(liabM)} total={bs.totalLiabilities} bold />
                <MultiRow label="TOTAL EQUITY" values={pick(equityM)} total={bs.totalEquity} bold />
                <MultiRow label="TOTAL LIABILITIES & EQUITY" values={pick(liabM.map((l, i) => l + equityM[i]))} total={bs.totalLiabilities + bs.totalEquity} bold doubleRule />
              </tbody>
            </table>
          </div>
        </div>
      )
    } else {
    body = (
      <div className="py-1">
        {bs.sections.map(s => (
          <div key={s.key}>
            <Row label={s.label} bold />
            {s.rows.map(r => (
              <Row key={r.number} label={`${r.number} ${r.title}${r.virtual ? ' *' : ''}`} amount={r.closing} indent={1} onClick={() => openDrill(r)} />
            ))}
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
    }
  } else {
    const cf = data.cashFlow
    if (view !== 'annual' && cf.monthly) {
      const colLabels = view === 'quarterly' ? QUARTERS : MONTHS
      const fold = (m12: number[]) => view === 'quarterly'
        ? [0, 1, 2, 3].map(q => (m12[q * 3] || 0) + (m12[q * 3 + 1] || 0) + (m12[q * 3 + 2] || 0))
        : m12
      const zero = Array(12).fill(0)
      const niM = fold(cf.monthly.netIncome), depMv = fold(cf.monthly.depreciation), provM = fold(cf.monthly.taxProvision)
      const wcM = colLabels.map((_, i) => cf.workingCapital.reduce((s, w) => s + (fold(w.monthly || zero)[i] || 0), 0))
      const invM = colLabels.map((_, i) => cf.investing.reduce((s, w) => s + (fold(w.monthly || zero)[i] || 0), 0))
      const finM = colLabels.map((_, i) => cf.financing.reduce((s, w) => s + (fold(w.monthly || zero)[i] || 0), 0))
      const opsM = niM.map((n, i) => n + depMv[i] + provM[i] + wcM[i])
      const cashDeltaM = fold(cf.monthly.cashDelta)
      let runCash = cf.beginningCash
      const beginM = cashDeltaM.map(d => { const b = runCash; runCash += d; return b })
      const endM = cashDeltaM.map((d, i) => beginM[i] + d)
      body = (
        <div className="py-1">
          <p className="text-xs italic px-4 py-2" style={{ color: 'var(--mid-gray)' }}>
            Indirect-method flows per {view === 'quarterly' ? 'quarter' : 'month'} — ending cash chains into the next {view === 'quarterly' ? 'quarter' : 'month'}&apos;s beginning cash.
          </p>
          <div className="overflow-auto" style={{ maxHeight: '75vh' }}>
            <table className="w-full text-[0.75rem]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Line Item', ...colLabels, 'Total'].map((m, i) => (
                    <th key={m} className={`px-2 py-1.5 font-semibold ${i === 0 ? 'text-left px-3' : 'text-right'}`}
                      style={{ color: '#374151', position: 'sticky', top: 0, zIndex: 2, background: 'white', boxShadow: 'inset 0 -2px 0 #e5e7eb', ...(m === 'Total' ? { borderLeft: '1px solid #e5e7eb' } : {}) }}>{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr><td colSpan={colLabels.length + 2} className="px-3 pt-2 pb-1 font-semibold text-[0.72rem] uppercase" style={{ color: '#111827' }}>Cash Flows from Operating Activities</td></tr>
                <MultiRow label="Net Income" indent={1} values={niM} total={cf.netIncome} bold />
                <MultiRow label="Add: Depreciation (non-cash)" indent={1} values={depMv} total={cf.depreciation} />
                <MultiRow label="Add: Income tax provision (accrued)" indent={1} values={provM} total={cf.taxProvision} />
                {cf.workingCapital.map((w, i) => (
                  <MultiRow key={i} label={w.label} indent={1} values={fold(w.monthly || zero)} total={w.amount} />
                ))}
                <MultiRow label="Net Cash from Operating Activities" values={opsM} total={cf.netOperating} bold rule />
                <tr><td colSpan={colLabels.length + 2} className="px-3 pt-2 pb-1 font-semibold text-[0.72rem] uppercase" style={{ color: '#111827' }}>Investing Activities</td></tr>
                {cf.investing.map((w, i) => (
                  <MultiRow key={i} label={w.label} indent={1} values={fold(w.monthly || zero)} total={w.amount} />
                ))}
                <MultiRow label="Net Cash from Investing Activities" values={invM} total={cf.netInvesting} bold rule />
                <tr><td colSpan={colLabels.length + 2} className="px-3 pt-2 pb-1 font-semibold text-[0.72rem] uppercase" style={{ color: '#111827' }}>Financing Activities</td></tr>
                {cf.financing.map((w, i) => (
                  <MultiRow key={i} label={w.label} indent={1} values={fold(w.monthly || zero)} total={w.amount} />
                ))}
                <MultiRow label="Net Cash from Financing Activities" values={finM} total={cf.netFinancing} bold rule />
                <MultiRow label="NET CHANGE IN CASH" values={cashDeltaM} total={cf.netChange} bold doubleRule />
                <MultiRow label="Beginning Cash" values={beginM} total={cf.beginningCash} />
                <MultiRow label="ENDING CASH" values={endM} total={cf.endingCash} bold doubleRule />
              </tbody>
            </table>
          </div>
        </div>
      )
    } else {
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
        {cf.cashAccounts.map((c, i) => {
          const m = c.key.match(/^(\S+)\s+(.*)$/)
          return (
            <Row key={i} label={c.key} amount={c.amount} indent={1}
              onClick={m ? () => setDrill({ account: m[1], title: c.key, month: null }) : undefined} />
          )
        })}
        <Row label="ENDING CASH" amount={cf.endingCash} bold doubleRule />
      </div>
    )
    }
  }

  return (
    <div className="pb-2">
      {body}
      {integrity}
      <p className="px-5 pt-1 text-[0.68rem]" style={{ color: '#9ca3af' }}>
        * derived account (not yet in the Chart of Accounts). Click any amount to see the entries behind it.
      </p>
      {drill && (
        <DrillDown year={year} branch={branch} account={drill.account} title={drill.title} month={drill.month} onClose={() => setDrill(null)} />
      )}
    </div>
  )
}
