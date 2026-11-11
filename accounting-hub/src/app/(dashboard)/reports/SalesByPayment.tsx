'use client'

// Reports → Sales by Payment (Hannah 2026-11-11): the Income Statement's Gross
// Sales only, each line split into how it was paid — Cash (everything the
// patient paid: cash, cards, package, VIP / prepaid card…), GL and HMO — in
// pesos and as a % of total sales, with cards on top for the overall mix.
// Totals tie to the Income Statement; see /api/reports/sales-by-payment.
import { useEffect, useState } from 'react'
import PaymentMixChart from './PaymentMixChart'
import { Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export type SbpRow = { number: string; title: string; cash: number; gl: number; hmo: number; other: number; total: number }
export type SbpMonthRow = { number: string; month: number; cash: number; gl: number; hmo: number; other: number; total: number }
export type SbpPayload = {
  year: number; branch: string; from: number; to: number
  rows: SbpRow[]
  /** Same split per line per month (Monthly view). */
  monthly: SbpMonthRow[]
  totals: { cash: number; gl: number; hmo: number; other: number; total: number }
  /** Net basis: each line after its own discounts, plus a "DISC" row for discounts no POS sale explains. */
  netRows: SbpRow[]
  monthlyNet: SbpMonthRow[]
  netTotals: { cash: number; gl: number; hmo: number; other: number; total: number }
  discountTotal: number
  /** amount = gross, net = after discounts */
  cashMethods: { method: string; label: string; amount: number; net: number }[]
  notes: string[]
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export type Col = 'cash' | 'gl' | 'hmo' | 'other'
// `fill` marks the series (chart segments, mix bars, swatches) — a validated
// categorical set (dataviz validate_palette: light mode, adjacent order
// Cash·GL·HMO·Not from POS, all checks pass; Cash is below 3:1 on white, so the
// legend and the table carry its values). Text never wears these colors.
export const COLS: { key: Col; label: string; fill: string; bg: string }[] = [
  { key: 'cash', label: 'Cash', fill: '#1baf7a', bg: '#f0fbf6' },
  { key: 'gl', label: 'GL', fill: '#2a78d6', bg: '#f1f6fd' },
  { key: 'hmo', label: 'HMO', fill: '#eb6834', bg: '#fef4ef' },
  { key: 'other', label: 'Not from POS', fill: '#6250d6', bg: '#f5f4fd' },
]
const Swatch = ({ fill }: { fill: string }) => (
  <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]" style={{ background: fill }} />
)

export default function SalesByPayment({ year, branch, onData }: {
  year: number
  branch: string
  onData?: (d: SbpPayload | null) => void
}) {
  const [fromM, setFromM] = useState(1)
  const [toM, setToM] = useState(12)
  // % of total sales (every cell against the grand total) or of the line itself.
  const [pctOf, setPctOf] = useState<'total' | 'line'>('total')
  // Summary (one row per gross sales line) or Monthly (one row per month, for all
  // lines or one line picked below) — Hannah 2026-11-11.
  const [view, setView] = useState<'summary' | 'monthly'>('summary')
  const [line, setLine] = useState('')
  // Net sales (after discounts — the default; PWD/SC discounts sit mostly on
  // cash-paying patients, so gross overstates Cash) or gross sales. Hannah 2026-11-11.
  const [basis, setBasis] = useState<'net' | 'gross'>('net')
  const key = `${year}|${branch}|${fromM}|${toM}`
  const [result, setResult] = useState<{ key: string; data: SbpPayload | null; error: string | null }>({ key: '', data: null, error: null })

  useEffect(() => {
    let live = true
    fetch(`/api/reports/sales-by-payment?year=${year}&branch=${encodeURIComponent(branch)}&from=${fromM}&to=${toM}`)
      .then(async r => {
        const j = await r.json()
        if (!live) return
        if (!r.ok) { setResult({ key, data: null, error: j.error || 'Failed to load' }); onData?.(null); return }
        setResult({ key, data: j, error: null })
        onData?.(j)
      })
      .catch(() => { if (live) { setResult({ key, data: null, error: 'Failed to load' }); onData?.(null) } })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const loading = result.key !== key
  const data = result.data
  const monthPicker = (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center rounded-lg overflow-hidden mr-1" style={{ border: '1px solid var(--light-gray)' }}>
        {([['net', 'Net sales'], ['gross', 'Gross sales']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => { setBasis(k); setLine('') }} className="px-2.5 py-1.5 text-xs font-semibold"
            style={basis === k ? { background: 'var(--deep-teal, #14532d)', color: 'white' } : { background: 'white', color: 'var(--charcoal)' }}>
            {l}
          </button>
        ))}
      </div>
      <span className="text-xs font-medium" style={{ color: 'var(--mid-gray)' }}>From</span>
      <select value={fromM} onChange={e => { const v = Number(e.target.value); setFromM(v); if (v > toM) setToM(v) }}
        className="px-2 py-1.5 rounded-lg text-xs" style={{ border: '1px solid var(--light-gray)' }}>
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <span className="text-xs font-medium" style={{ color: 'var(--mid-gray)' }}>to</span>
      <select value={toM} onChange={e => { const v = Number(e.target.value); setToM(v); if (v < fromM) setFromM(v) }}
        className="px-2 py-1.5 rounded-lg text-xs" style={{ border: '1px solid var(--light-gray)' }}>
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <div className="flex items-center rounded-lg overflow-hidden ml-2" style={{ border: '1px solid var(--light-gray)' }}>
        {([['summary', 'Summary'], ['monthly', 'Monthly']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setView(k)} className="px-2.5 py-1.5 text-xs font-semibold"
            style={view === k ? { background: 'var(--deep-teal, #14532d)', color: 'white' } : { background: 'white', color: 'var(--charcoal)' }}>
            {l}
          </button>
        ))}
      </div>
      {view === 'summary' ? (
        <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
          {([['total', '% of total sales'], ['line', '% of the line']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setPctOf(k)} className="px-2.5 py-1.5 text-xs font-medium"
              style={pctOf === k ? { background: 'var(--teal)', color: 'white' } : { background: 'white', color: 'var(--charcoal)' }}>
              {l}
            </button>
          ))}
        </div>
      ) : (
        <select value={line} onChange={e => setLine(e.target.value)} aria-label="Sales line"
          className="px-2 py-1.5 rounded-lg text-xs" style={{ border: '1px solid var(--light-gray)' }}>
          <option value="">All {basis === 'net' ? 'net' : 'gross'} sales</option>
          {((basis === 'net' ? result.data?.netRows : result.data?.rows) || []).map(r => (
            <option key={r.number} value={r.number}>{r.number === 'DISC' ? r.title : `${r.number} ${r.title}`}</option>
          ))}
        </select>
      )}
    </div>
  )

  if (loading) return (
    <div className="px-4 pb-4">
      <div className="mb-3">{monthPicker}</div>
      <div className="flex items-center justify-center py-16 gap-2 text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={18} className="animate-spin" /> Splitting sales by payment…</div>
    </div>
  )
  if (result.error || !data) return <div className="py-16 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>{result.error || 'No data'}</div>

  const isNet = basis === 'net'
  const srcRows = (isNet ? data.netRows : data.rows) || []
  const srcMonthly = (isNet ? data.monthlyNet : data.monthly) || []
  const srcTotals = (isNet ? data.netTotals : data.totals) || data.totals
  const basisLabel = isNet ? 'Net Sales' : 'Gross Sales'
  const rowLabel = (r: SbpRow) => (r.number === 'DISC' ? r.title : `${r.number} ${r.title}`)
  // Monthly view: one row per month for the picked line (or every line).
  const monthRows = Array.from({ length: data.to - data.from + 1 }, (_, i) => data.from + i).map(month => {
    const own = srcMonthly.filter(x => x.month === month && (!line || x.number === line))
    const sum = (k: Col | 'total') => own.reduce((t, x) => t + x[k], 0)
    return { month, cash: sum('cash'), gl: sum('gl'), hmo: sum('hmo'), other: sum('other'), total: sum('total') }
  })
  const pickedRow = line ? srcRows.find(r => r.number === line) : null
  const T = view === 'monthly' && pickedRow
    ? { cash: pickedRow.cash, gl: pickedRow.gl, hmo: pickedRow.hmo, other: pickedRow.other, total: pickedRow.total }
    : srcTotals
  // Gross shares beside the net ones, so the discount skew is visible.
  const grossPicked = view === 'monthly' && line ? data.rows.find(r => r.number === line) : null
  const G = grossPicked || data.totals
  const showOther = (view === 'monthly' ? monthRows : srcRows).some(r => Math.abs(r.other) >= 0.5)
  const cols = COLS.filter(c => c.key !== 'other' || showOther)
  // Negatives in brackets like the amounts; a rounding −0.0% reads 0.0%.
  const pct = (v: number, base: number) => {
    if (!base) return '—'
    const p = (v / base) * 100
    const r = Math.abs(p) < 0.05 ? 0 : p
    return r < 0 ? `(${Math.abs(r).toFixed(1)}%)` : `${r.toFixed(1)}%`
  }
  const fmt = (v: number) => (v < 0 ? `(${Math.round(Math.abs(v)).toLocaleString('en-PH')})` : Math.round(v).toLocaleString('en-PH'))
  const methodAmt = (m: SbpPayload['cashMethods'][number]) => (isNet ? m.net : m.amount)
  const methodBase = data.cashMethods.reduce((t, m) => t + methodAmt(m), 0)

  return (
    <div className="px-4 pb-4 space-y-4">
      {monthPicker}

      {/* Overall mix */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${showOther ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3`}>
        {cols.map(c => (
          <div key={c.key} className="rounded-xl px-4 py-3" style={{ border: '1px solid var(--light-gray)', background: c.bg }}>
            <p className="text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}><Swatch fill={c.fill} />{c.label}</p>
            <p className="text-2xl font-bold tabular-nums mt-0.5" style={{ color: 'var(--charcoal)' }}>{pct(T[c.key], T.total)}</p>
            <p className="text-xs tabular-nums" style={{ color: 'var(--charcoal)' }}>{formatCurrency(T[c.key])} of {formatCurrency(T.total)} {isNet ? 'net' : 'gross'}</p>
            {isNet && G && (
              <p className="text-[11px] tabular-nums" style={{ color: 'var(--mid-gray)' }}>{pct(G[c.key], G.total)} of gross sales</p>
            )}
            {c.key === 'cash' && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>Cash, cards, GCash/Maya, package, VIP and prepaid card, advance and downpayment</p>
            )}
            {c.key === 'other' && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>Sales booked by journal entry rather than a POS sale, or with no payment recorded</p>
            )}
          </div>
        ))}
      </div>

      {view === 'monthly' && (
        <PaymentMixChart
          months={monthRows.map(r => ({ month: r.month, label: MONTHS[r.month - 1].slice(0, 3), cash: r.cash, gl: r.gl, hmo: r.hmo, other: r.other, total: r.total }))}
          series={cols}
          title={pickedRow ? rowLabel(pickedRow) : `All ${basisLabel.toLowerCase()}`}
        />
      )}

      {view === 'monthly' && (
        <div className="rounded-lg overflow-x-auto bg-white" style={{ border: '1px solid var(--light-gray)' }}>
          <table className="w-full table-auto">
            <thead>
              <tr style={{ background: 'var(--hr-head)' }}>
                <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>
                  {pickedRow ? rowLabel(pickedRow) : `All ${basisLabel.toLowerCase()}`}
                </th>
                {cols.map(c => (
                  <th key={c.key} colSpan={2} className="px-2 py-2 text-right text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}><Swatch fill={c.fill} />{c.label}</th>
                ))}
                <th className="px-2 py-2 text-right text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)', borderLeft: '2px solid #94a3b8' }}>Total</th>
                <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)', minWidth: 140 }}>Mix</th>
              </tr>
            </thead>
            <tbody>
              {[...monthRows, { month: 0, ...T }].map(r => {
                const isTotal = r.month === 0
                return (
                  <tr key={r.month} style={{ borderTop: isTotal ? '2px solid #94a3b8' : '1px solid var(--light-gray)', background: isTotal ? '#f8fafc' : undefined }}>
                    <td className={`px-2 py-1.5 text-xs whitespace-nowrap ${isTotal ? 'font-semibold' : ''}`} style={{ color: 'var(--charcoal)' }}>
                      {isTotal ? `Total ${MONTHS[data.from - 1].slice(0, 3)}–${MONTHS[data.to - 1].slice(0, 3)}` : MONTHS[r.month - 1]}
                    </td>
                    {cols.map(c => {
                      const v = r[c.key]
                      return [
                        <td key={`${c.key}a`} className={`pl-2 py-1.5 text-right tabular-nums text-xs whitespace-nowrap ${isTotal ? 'font-semibold' : ''}`}
                          style={{ color: v < 0 ? '#b91c1c' : isTotal ? '#111827' : 'var(--charcoal)' }}>{Math.abs(v) < 0.5 ? '—' : fmt(v)}</td>,
                        <td key={`${c.key}p`} className={`pr-3 pl-1 py-1.5 text-right tabular-nums text-[11px] whitespace-nowrap ${isTotal ? 'font-semibold' : ''}`}
                          style={{ color: isTotal ? 'var(--charcoal)' : 'var(--mid-gray)' }}>{Math.abs(v) < 0.5 ? '' : pct(v, r.total)}</td>,
                      ]
                    })}
                    <td className={`pl-2 pr-2 py-1.5 text-right tabular-nums text-xs whitespace-nowrap ${isTotal ? 'font-bold' : 'font-semibold'}`}
                      style={{ color: '#111827', borderLeft: '2px solid #94a3b8' }}>{Math.abs(r.total) < 0.5 ? '—' : fmt(r.total)}</td>
                    <td className="px-3 py-1.5">
                      {r.total > 0.5 && (
                        <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: '#eef2f6', minWidth: 120 }}
                          title={cols.map(c => `${c.label} ${pct(r[c.key], r.total)}`).join(' · ')}>
                          {cols.map(c => {
                            const w = Math.max(0, (r[c.key] / r.total) * 100)
                            return w > 0 ? <div key={c.key} style={{ width: `${w}%`, background: c.fill }} /> : null
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === 'summary' && (
      <div className="rounded-lg overflow-x-auto bg-white" style={{ border: '1px solid var(--light-gray)' }}>
        <table className="w-full table-auto">
          <thead>
            <tr style={{ background: 'var(--hr-head)' }}>
              <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>{basisLabel} by department</th>
              {cols.map(c => (
                <th key={c.key} colSpan={2} className="px-2 py-2 text-right text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}><Swatch fill={c.fill} />{c.label}</th>
              ))}
              <th colSpan={2} className="px-2 py-2 text-right text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)', borderLeft: '2px solid #94a3b8' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {srcRows.map(r => (
              <tr key={r.number} style={{ borderTop: '1px solid var(--light-gray)' }}>
                <td className={`px-2 py-1.5 text-xs whitespace-nowrap ${r.number === 'DISC' ? 'italic' : ''}`} style={{ color: r.number === 'DISC' ? 'var(--mid-gray)' : 'var(--charcoal)' }}
                  title={r.number === 'DISC' ? 'Discounts on the Income Statement that no POS sale explains: discounts given when an HMO or GL agency paid (by its type), TikTok fees, journal entries.' : undefined}>
                  {rowLabel(r)}
                </td>
                {cols.map(c => {
                  const v = r[c.key]
                  return [
                    <td key={`${c.key}a`} className="pl-2 py-1.5 text-right tabular-nums text-xs whitespace-nowrap" style={{ color: v < 0 ? '#b91c1c' : 'var(--charcoal)' }}>{Math.abs(v) < 0.5 ? '—' : fmt(v)}</td>,
                    <td key={`${c.key}p`} className="pr-3 pl-1 py-1.5 text-right tabular-nums text-[11px] whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
                      {Math.abs(v) < 0.5 ? '' : pct(v, pctOf === 'total' ? T.total : r.total)}
                    </td>,
                  ]
                })}
                <td className="pl-2 py-1.5 text-right tabular-nums text-xs font-semibold whitespace-nowrap" style={{ color: '#111827', borderLeft: '2px solid #94a3b8' }}>{fmt(r.total)}</td>
                <td className="pr-2 pl-1 py-1.5 text-right tabular-nums text-[11px] whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{pctOf === 'total' ? pct(r.total, T.total) : '100%'}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid #94a3b8', background: '#f8fafc' }}>
              <td className="px-2 py-1.5 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>Total {basisLabel}</td>
              {cols.map(c => [
                <td key={`${c.key}a`} className="pl-2 py-1.5 text-right tabular-nums text-xs font-semibold whitespace-nowrap" style={{ color: '#111827' }}>{fmt(T[c.key])}</td>,
                <td key={`${c.key}p`} className="pr-3 pl-1 py-1.5 text-right tabular-nums text-[11px] font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{pct(T[c.key], T.total)}</td>,
              ])}
              <td className="pl-2 py-1.5 text-right tabular-nums text-xs font-bold whitespace-nowrap" style={{ color: '#111827', borderLeft: '2px solid #94a3b8' }}>{fmt(T.total)}</td>
              <td className="pr-2 pl-1 py-1.5 text-right tabular-nums text-[11px] font-semibold whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>100%</td>
            </tr>
          </tbody>
        </table>
      </div>
      )}

      {data.cashMethods.length > 0 && (
        <div className="rounded-lg px-4 py-3 bg-white" style={{ border: '1px solid var(--light-gray)' }}>
          <p className="text-[11px] font-bold uppercase tracking-[.4px] mb-2" style={{ color: 'var(--mid-gray)' }}>
            <Swatch fill={COLS[0].fill} />What makes up Cash — {isNet ? 'net' : 'gross'}{view === 'monthly' && line ? ' (all lines)' : ''}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {[...data.cashMethods].sort((a, b) => methodAmt(b) - methodAmt(a)).map(m => (
              <span key={m.method} className="text-xs tabular-nums" style={{ color: 'var(--charcoal)' }}>
                {m.label} <span className="font-semibold">{formatCurrency(methodAmt(m))}</span>
                <span style={{ color: 'var(--mid-gray)' }}> · {pct(methodAmt(m), methodBase)} of cash</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-[11px]" style={{ color: '#94a3b8' }}>
          {isNet
            ? `Net sales = the Income Statement's sales lines less discounts (other income and interest left out); total net sales ${formatCurrency(srcTotals.total)} after ${formatCurrency(data.discountTotal || 0)} of discounts. `
            : 'Gross sales before discounts, as on the Income Statement\u2019s sales lines (other income and interest left out). '}
          Each sale is split by how its order was paid; an order paid partly by HMO and partly in cash is split in proportion.
          {view === 'monthly' && ' In the Monthly view each % is of that month\u2019s sales.'}
          Amounts in whole pesos.
        </p>
        {data.notes.map((n, i) => <p key={i} className="text-[11px]" style={{ color: '#94a3b8' }}>{n}</p>)}
      </div>
    </div>
  )
}
