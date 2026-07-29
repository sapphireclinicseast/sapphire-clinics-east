'use client'

// Renders the Reports v2 (ledger-derived) statements — one balanced dataset,
// three interconnected statements. Amounts are clickable (drill down to the
// underlying entries), the Income Statement has a monthly view, and the
// integrity card sits at the bottom in plain language.
import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Loader2, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { INCOME_TAX_RATE } from '@/lib/reports/income-statement-totals'
import type { V2Statements, V2AccountRow, V2CollectedLine } from '@/lib/reports/v2/engine'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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

const fmtAmt = (v: number) => (v < 0 ? `(${formatCurrency(Math.abs(v))})` : formatCurrency(v))

function Amt({ v, bold, onClick }: { v: number; bold?: boolean; onClick?: () => void }) {
  return (
    <span
      className={`tabular-nums${onClick ? ' cursor-pointer hover:underline' : ''}`}
      style={{ color: v < 0 ? '#b91c1c' : '#111827', fontWeight: bold ? 600 : 400 }}
      onClick={onClick}
    >
      {fmtAmt(v)}
    </span>
  )
}

function Row({ label, amount, indent = 0, bold, rule, doubleRule, onClick }: {
  label: string; amount?: number; indent?: number; bold?: boolean; rule?: boolean; doubleRule?: boolean; onClick?: () => void
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
      }}
    >
      <span style={{ fontWeight: bold ? 600 : 400, color: '#111827' }}>{label}</span>
      {amount !== undefined && <Amt v={amount} bold={bold} onClick={onClick} />}
    </div>
  )
}

/* ── Monthly income-statement table ─────────────────────────────── */

function MonthlyCells({ values, total, bold, onClickCell }: {
  values: number[]; total: number; bold?: boolean; onClickCell?: (m: number | null) => void
}) {
  return (
    <>
      {values.map((v, i) => (
        <td key={i} className="px-2 py-1 text-right whitespace-nowrap">
          {Math.abs(v) >= 0.005 ? <Amt v={v} bold={bold} onClick={onClickCell ? () => onClickCell(i + 1) : undefined} /> : <span style={{ color: '#d1d5db' }}>—</span>}
        </td>
      ))}
      <td className="px-2 py-1 text-right whitespace-nowrap" style={{ borderLeft: '1px solid #e5e7eb' }}>
        <Amt v={total} bold={bold} onClick={onClickCell ? () => onClickCell(null) : undefined} />
      </td>
    </>
  )
}

function MonthlyRow({ label, indent, bold, rule, doubleRule, ...cells }: {
  label: string; values: number[]; total: number; indent?: number; bold?: boolean; rule?: boolean; doubleRule?: boolean; onClickCell?: (m: number | null) => void
}) {
  return (
    <tr className="hover:bg-gray-50" style={{
      borderTop: rule ? '1px solid #d1d5db' : undefined,
      borderBottom: doubleRule ? '3px double #111827' : rule || bold ? undefined : '1px solid #f3f4f6',
      background: doubleRule ? '#f9fafb' : undefined,
    }}>
      <td className="px-3 py-1 whitespace-nowrap" style={{ paddingLeft: indent ? `${1 + indent * 1.25}rem` : undefined, fontWeight: bold ? 600 : 400 }}>
        {label}
      </td>
      <MonthlyCells {...cells} bold={bold} />
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
          <button onClick={onClose}><X size={18} style={{ color: '#6b7280' }} /></button>
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
                    <td className="px-3 py-1" style={{ color: '#111827' }}>{l.label}</td>
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

export default function LedgerStatements({ year, branch, tab, monthly }: {
  year: number
  branch: string
  tab: 'balance-sheet' | 'income-statement' | 'cash-flow'
  monthly: boolean
}) {
  // Keyed result: loading is derived (result key ≠ current key), so the effect
  // never calls setState synchronously.
  const key = `${year}|${branch}`
  const [result, setResult] = useState<{ key: string; data: V2Statements | null; error: string | null }>({ key: '', data: null, error: null })
  const [drill, setDrill] = useState<{ account: string; title: string; month: number | null } | null>(null)

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
    const secMonthly = (key: string) => {
      const s = sec(key)
      return Array.from({ length: 12 }, (_, i) => (s?.rows || []).reduce((sum, r) => sum + (r.monthly?.[i] || 0), 0))
    }
    if (monthly) {
      const revM = secMonthly('REVENUE'), discM = secMonthly('DISCOUNTS'), cogsM = secMonthly('COGS'), opexM = secMonthly('OPEX')
      const depM = secMonthly('DEPRECIATION'), intM = secMonthly('INTEREST'), nonopM = secMonthly('NON_OPERATING')
      const netSalesM = revM.map((r, i) => r - discM[i])
      const ebitdaM = netSalesM.map((n, i) => n - cogsM[i] - opexM[i])
      const ebtM = ebitdaM.map((e, i) => e - depM[i] - intM[i] - nonopM[i])
      const mv = (r: V2AccountRow) => ({ values: r.monthly || Array(12).fill(0), total: (r.monthly || []).reduce((s, x) => s + x, 0) })
      body = (
        <div className="overflow-x-auto py-1">
          <table className="w-full text-[0.75rem]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th className="px-3 py-1.5 text-left font-semibold" style={{ color: '#374151' }}>Line Item</th>
                {MONTHS.map(m => <th key={m} className="px-2 py-1.5 text-right font-semibold" style={{ color: '#374151' }}>{m}</th>)}
                <th className="px-2 py-1.5 text-right font-semibold" style={{ color: '#374151', borderLeft: '1px solid #e5e7eb' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {sec('REVENUE') && (<>
                <tr><td colSpan={14} className="px-3 pt-2 pb-1 font-semibold text-[0.72rem] uppercase" style={{ color: '#111827' }}>Gross Revenue</td></tr>
                {sec('REVENUE')!.rows.map(r => (
                  <MonthlyRow key={r.number} label={`${r.number} ${r.title}`} indent={1} {...mv(r)}
                    onClickCell={m => openDrill(r, m)} />
                ))}
                <MonthlyRow label="Total Gross Revenue" values={revM} total={revM.reduce((a, b) => a + b, 0)} bold rule />
              </>)}
              {sec('DISCOUNTS') && (<>
                <tr><td colSpan={14} className="px-3 pt-2 pb-1 font-semibold text-[0.72rem] uppercase" style={{ color: '#111827' }}>Discounts and Refunds</td></tr>
                {sec('DISCOUNTS')!.rows.map(r => (
                  <MonthlyRow key={r.number} label={`${r.number} ${r.title}`} indent={1}
                    values={(r.monthly || []).map(x => -x)} total={-(r.monthly || []).reduce((s, x) => s + x, 0)}
                    onClickCell={m => openDrill(r, m)} />
                ))}
              </>)}
              <MonthlyRow label="Net Sales" values={netSalesM} total={is.netSales} bold doubleRule />
              {sec('COGS') && (<>
                <tr><td colSpan={14} className="px-3 pt-2 pb-1 font-semibold text-[0.72rem] uppercase" style={{ color: '#111827' }}>Cost of Sales</td></tr>
                {sec('COGS')!.rows.map(r => (
                  <MonthlyRow key={r.number} label={`${r.number} ${r.title}`} indent={1} {...mv(r)} onClickCell={m => openDrill(r, m)} />
                ))}
              </>)}
              <MonthlyRow label="Gross Profit" values={netSalesM.map((n, i) => n - cogsM[i])} total={is.grossProfit} bold doubleRule />
              {sec('OPEX') && (<>
                <tr><td colSpan={14} className="px-3 pt-2 pb-1 font-semibold text-[0.72rem] uppercase" style={{ color: '#111827' }}>Operating Expenses</td></tr>
                {sec('OPEX')!.rows.map(r => (
                  <MonthlyRow key={r.number} label={`${r.number} ${r.title}`} indent={1} {...mv(r)} onClickCell={m => openDrill(r, m)} />
                ))}
              </>)}
              <MonthlyRow label="EBITDA" values={ebitdaM} total={is.ebitda} bold doubleRule />
              {(['DEPRECIATION', 'INTEREST', 'NON_OPERATING'] as const).map(k => sec(k) && sec(k)!.rows.map(r => (
                <MonthlyRow key={r.number} label={`${r.number} ${r.title}`} indent={1} {...mv(r)} onClickCell={m => openDrill(r, m)} />
              )))}
              <MonthlyRow label="EBT" values={ebtM} total={is.ebt} bold rule />
              <MonthlyRow label="Provision for Income Tax (20%)" indent={1}
                values={ebtM.map(e => e * INCOME_TAX_RATE)} total={is.taxProvision} />
              <MonthlyRow label="NET INCOME" values={ebtM.map(e => e * (1 - INCOME_TAX_RATE))} total={is.netIncome} bold doubleRule />
            </tbody>
          </table>
        </div>
      )
    } else {
      body = (
        <div className="py-1">
          {sec('REVENUE') && (<>
            <Row label="Gross Revenue" bold />
            {sec('REVENUE')!.rows.map(r => (
              <Row key={r.number} label={`${r.number} ${r.title}${r.virtual ? ' *' : ''}`}
                amount={r.closing - r.opening} indent={1} onClick={() => openDrill(r)} />
            ))}
            <Row label="Total Gross Revenue" amount={sec('REVENUE')!.total} bold rule />
          </>)}
          {sec('DISCOUNTS') && (<>
            <Row label="Discounts and Refunds" bold />
            {sec('DISCOUNTS')!.rows.map(r => (
              <Row key={r.number} label={`${r.number} ${r.title}`} amount={-(r.closing - r.opening)} indent={1} onClick={() => openDrill(r)} />
            ))}
            <Row label="Total Discounts and Refunds" amount={-sec('DISCOUNTS')!.total} bold rule />
          </>)}
          <Row label="Net Sales" amount={is.netSales} bold doubleRule />
          {sec('COGS') && (<>
            <Row label="Cost of Sales" bold />
            {sec('COGS')!.rows.map(r => (
              <Row key={r.number} label={`${r.number} ${r.title}${r.virtual ? ' *' : ''}`} amount={r.closing - r.opening} indent={1} onClick={() => openDrill(r)} />
            ))}
            <Row label="Total Cost of Sales" amount={is.totalCOGS} bold rule />
          </>)}
          <Row label="Gross Profit" amount={is.grossProfit} bold doubleRule />
          {sec('OPEX') && (<>
            <Row label="Operating Expenses" bold />
            {sec('OPEX')!.rows.map(r => (
              <Row key={r.number} label={`${r.number} ${r.title}${r.virtual ? ' *' : ''}`} amount={r.closing - r.opening} indent={1} onClick={() => openDrill(r)} />
            ))}
            <Row label="Total Operating Expenses" amount={is.totalOpex} bold rule />
          </>)}
          <Row label="EBITDA" amount={is.ebitda} bold doubleRule />
          {(['DEPRECIATION', 'INTEREST', 'NON_OPERATING'] as const).map(k => sec(k)?.rows.map(r => (
            <Row key={r.number} label={`${r.number} ${r.title}`} amount={r.closing - r.opening} indent={1} onClick={() => openDrill(r)} />
          )))}
          <Row label="EBT" amount={is.ebt} bold rule />
          <Row label="Provision for Income Tax (20%)" amount={is.taxProvision} indent={1} />
          <Row label="NET INCOME" amount={is.netIncome} bold doubleRule />
        </div>
      )
    }
  } else if (tab === 'balance-sheet') {
    const bs = data.balanceSheet
    body = (
      <div className="py-1">
        {monthly && (
          <p className="text-xs italic px-4 py-2" style={{ color: 'var(--mid-gray)' }}>
            The Balance Sheet is a point-in-time statement — showing the year-end position. Use the Income Statement for monthly breakdowns.
          </p>
        )}
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
