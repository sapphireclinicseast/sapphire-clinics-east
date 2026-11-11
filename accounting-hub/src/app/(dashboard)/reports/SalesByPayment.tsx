'use client'

// Reports → Sales by Payment (Hannah 2026-11-11): the Income Statement's Gross
// Sales only, each line split into how it was paid — Cash (everything the
// patient paid: cash, cards, package, VIP / prepaid card…), GL and HMO — in
// pesos and as a % of total sales, with cards on top for the overall mix.
// Totals tie to the Income Statement; see /api/reports/sales-by-payment.
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export type SbpRow = { number: string; title: string; cash: number; gl: number; hmo: number; other: number; total: number }
export type SbpPayload = {
  year: number; branch: string; from: number; to: number
  rows: SbpRow[]
  totals: { cash: number; gl: number; hmo: number; other: number; total: number }
  cashMethods: { method: string; label: string; amount: number }[]
  notes: string[]
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
type Col = 'cash' | 'gl' | 'hmo' | 'other'
const COLS: { key: Col; label: string; color: string; bg: string }[] = [
  { key: 'cash', label: 'Cash', color: '#166534', bg: '#ecfdf5' },
  { key: 'gl', label: 'GL', color: '#1e40af', bg: '#eff6ff' },
  { key: 'hmo', label: 'HMO', color: '#9a3412', bg: '#fff7ed' },
  { key: 'other', label: 'Not from POS', color: '#475569', bg: '#f8fafc' },
]

export default function SalesByPayment({ year, branch, onData }: {
  year: number
  branch: string
  onData?: (d: SbpPayload | null) => void
}) {
  const [fromM, setFromM] = useState(1)
  const [toM, setToM] = useState(12)
  // % of total sales (every cell against the grand total) or of the line itself.
  const [pctOf, setPctOf] = useState<'total' | 'line'>('total')
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
        {([['total', '% of total sales'], ['line', '% of the line']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setPctOf(k)} className="px-2.5 py-1.5 text-xs font-medium"
            style={pctOf === k ? { background: 'var(--teal)', color: 'white' } : { background: 'white', color: 'var(--charcoal)' }}>
            {l}
          </button>
        ))}
      </div>
    </div>
  )

  if (loading) return (
    <div className="px-4 pb-4">
      <div className="mb-3">{monthPicker}</div>
      <div className="flex items-center justify-center py-16 gap-2 text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={18} className="animate-spin" /> Splitting sales by payment…</div>
    </div>
  )
  if (result.error || !data) return <div className="py-16 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>{result.error || 'No data'}</div>

  const T = data.totals
  const showOther = data.rows.some(r => Math.abs(r.other) >= 0.5)
  const cols = COLS.filter(c => c.key !== 'other' || showOther)
  // Negatives in brackets like the amounts; a rounding −0.0% reads 0.0%.
  const pct = (v: number, base: number) => {
    if (!base) return '—'
    const p = (v / base) * 100
    const r = Math.abs(p) < 0.05 ? 0 : p
    return r < 0 ? `(${Math.abs(r).toFixed(1)}%)` : `${r.toFixed(1)}%`
  }
  const fmt = (v: number) => (v < 0 ? `(${Math.round(Math.abs(v)).toLocaleString('en-PH')})` : Math.round(v).toLocaleString('en-PH'))
  const cashTotal = T.cash || 0

  return (
    <div className="px-4 pb-4 space-y-4">
      {monthPicker}

      {/* Overall mix */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${showOther ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3`}>
        {cols.map(c => (
          <div key={c.key} className="rounded-xl px-4 py-3" style={{ border: '1px solid var(--light-gray)', background: c.bg }}>
            <p className="text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: c.color }}>{c.label}</p>
            <p className="text-2xl font-bold tabular-nums mt-0.5" style={{ color: c.color }}>{pct(T[c.key], T.total)}</p>
            <p className="text-xs tabular-nums" style={{ color: 'var(--charcoal)' }}>{formatCurrency(T[c.key])} of {formatCurrency(T.total)}</p>
            {c.key === 'cash' && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>Cash, cards, GCash/Maya, package, VIP and prepaid card, advance and downpayment</p>
            )}
            {c.key === 'other' && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>Revenue booked by journal entry, not a POS sale (e.g. other income)</p>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg overflow-x-auto bg-white" style={{ border: '1px solid var(--light-gray)' }}>
        <table className="w-full table-auto">
          <thead>
            <tr style={{ background: 'var(--hr-head)' }}>
              <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Gross Sales</th>
              {cols.map(c => (
                <th key={c.key} colSpan={2} className="px-2 py-2 text-right text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: c.color }}>{c.label}</th>
              ))}
              <th colSpan={2} className="px-2 py-2 text-right text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)', borderLeft: '2px solid #94a3b8' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(r => (
              <tr key={r.number} style={{ borderTop: '1px solid var(--light-gray)' }}>
                <td className="px-2 py-1.5 text-xs whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{r.number} {r.title}</td>
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
              <td className="px-2 py-1.5 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>Total Gross Sales</td>
              {cols.map(c => [
                <td key={`${c.key}a`} className="pl-2 py-1.5 text-right tabular-nums text-xs font-semibold whitespace-nowrap" style={{ color: c.color }}>{fmt(T[c.key])}</td>,
                <td key={`${c.key}p`} className="pr-3 pl-1 py-1.5 text-right tabular-nums text-[11px] font-semibold whitespace-nowrap" style={{ color: c.color }}>{pct(T[c.key], T.total)}</td>,
              ])}
              <td className="pl-2 py-1.5 text-right tabular-nums text-xs font-bold whitespace-nowrap" style={{ color: '#111827', borderLeft: '2px solid #94a3b8' }}>{fmt(T.total)}</td>
              <td className="pr-2 pl-1 py-1.5 text-right tabular-nums text-[11px] font-semibold whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {data.cashMethods.length > 0 && (
        <div className="rounded-lg px-4 py-3 bg-white" style={{ border: '1px solid var(--light-gray)' }}>
          <p className="text-[11px] font-bold uppercase tracking-[.4px] mb-2" style={{ color: '#166534' }}>What makes up Cash</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {data.cashMethods.map(m => (
              <span key={m.method} className="text-xs tabular-nums" style={{ color: 'var(--charcoal)' }}>
                {m.label} <span className="font-semibold">{formatCurrency(m.amount)}</span>
                <span style={{ color: 'var(--mid-gray)' }}> · {pct(m.amount, cashTotal)} of cash</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-[11px]" style={{ color: '#94a3b8' }}>
          Gross sales before discounts, as on the Income Statement. Each sale is split by how its order was paid; an order paid partly by HMO and partly in cash is split in proportion.
          Amounts in whole pesos.
        </p>
        {data.notes.map((n, i) => <p key={i} className="text-[11px]" style={{ color: '#94a3b8' }}>{n}</p>)}
      </div>
    </div>
  )
}
