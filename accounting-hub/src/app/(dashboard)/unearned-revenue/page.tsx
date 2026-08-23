'use client'

// Unearned Revenue (4050) — the movement view. Money in before it is earned
// (package deposits, advance payments at cashiering) credits this account;
// consuming sessions and refunds debit it. This page shows that cycle:
// opening, monthly debit/credit movement, and every underlying line.
// Filterable by date range (history reaches back to 2024) and branch.
import { useEffect, useMemo, useState } from 'react'
import { Loader2, PiggyBank } from 'lucide-react'

interface Line { date: string; debit: number; credit: number; description: string; refType: string; jeDescription?: string; branch?: string }
const peso = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SOURCE_LABEL: Record<string, string> = {
  POS_ORDER: 'POS cashiering', POS_ORDER_REVERSAL: 'POS reversal', REFUND: 'Refund', MANUAL: 'Manual journal',
  BANK_REC: 'Bank rec', QB_LIAB_IMPORT: 'QB import', AR_PAYMENT: 'AR collection',
}
const BRANCHES: [string, string][] = [
  ['ALL', 'All branches'], ['SANDBOX_EAST', 'Aura Health East'], ['SANDBOX_GREENHILLS', 'Aura Health Greenhills'],
  ['VERDANA_STORE', 'Verdana'], ['AURA_INSTITUTE', 'Aura Health Institute'],
]
// History starts in 2024 (QB import); default the range to everything.
const HISTORY_START = '2024-01-01'
const todayStr = () => new Date().toISOString().slice(0, 10)

export default function UnearnedRevenuePage() {
  const [lines, setLines] = useState<Line[]>([])
  const [opening, setOpening] = useState(0)
  const [loading, setLoading] = useState(true)
  const [monthKey, setMonthKey] = useState('')   // 'YYYY-MM' selected in the month strip
  const [src, setSrc] = useState('')
  const [from, setFrom] = useState(HISTORY_START)
  const [to, setTo] = useState(todayStr())
  const [branch, setBranch] = useState('ALL')

  useEffect(() => {
    const ctl = new AbortController()
    ;(async () => {
      setLoading(true)
      try {
        const p = new URLSearchParams({ accountNumber: '4050', from, to, branch, limit: '50000' })
        const r = await fetch(`/api/journal-entries?${p}`, { signal: ctl.signal })
        const d = await r.json()
        setLines((d.lines || []).map((l: Line) => ({ ...l, debit: Number(l.debit), credit: Number(l.credit) })))
        setOpening(Number(d.opening) || 0)
        setMonthKey('')
      } catch { /* aborted / network */ }
      finally { if (!ctl.signal.aborted) setLoading(false) }
    })()
    return () => ctl.abort()
  }, [from, to, branch])

  // Month buckets across the whole range (multi-year): key 'YYYY-MM' in order.
  const monthly = useMemo(() => {
    const m = new Map<string, { dr: number; cr: number }>()
    for (const l of lines) {
      const k = String(l.date).slice(0, 7)
      const b = m.get(k) || { dr: 0, cr: 0 }
      b.dr += l.debit; b.cr += l.credit
      m.set(k, b)
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [lines])
  const totalDr = monthly.reduce((s, [, m]) => s + m.dr, 0)
  const totalCr = monthly.reduce((s, [, m]) => s + m.cr, 0)
  const closing = opening + totalCr - totalDr
  const monthLabel = (k: string) => `${MONTHS[parseInt(k.slice(5, 7), 10) - 1]} ${k.slice(2, 4)}`

  const sources = useMemo(() => [...new Set(lines.map(l => l.refType))].sort(), [lines])
  const shown = lines.filter(l =>
    (!monthKey || String(l.date).slice(0, 7) === monthKey) && (!src || l.refType === src))

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
        <PiggyBank size={22} style={{ color: 'var(--teal)' }} /> Unearned Revenue
      </h1>
      <p className="text-xs max-w-3xl" style={{ color: 'var(--mid-gray)' }}>
        4050 holds money received before it is earned — package deposits and advance payments credit it at cashiering;
        consumed sessions and refunds debit it back out. Credits grow the liability, debits release it.
      </p>

      {/* Range + branch filters */}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>From</label>
        <input type="date" value={from} min={HISTORY_START} onChange={e => setFrom(e.target.value)}
          className="px-2 py-1.5 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="px-2 py-1.5 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
        <select value={branch} onChange={e => setBranch(e.target.value)}
          className="px-2 py-1.5 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
          {BRANCHES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {(from !== HISTORY_START || to !== todayStr() || branch !== 'ALL') && (
          <button onClick={() => { setFrom(HISTORY_START); setTo(todayStr()); setBranch('ALL') }}
            className="text-xs underline" style={{ color: 'var(--teal)' }}>Reset</button>
        )}
      </div>

      {loading ? <div className="py-10 text-center"><Loader2 className="animate-spin inline" size={22} /></div> : (
        <>
          <div className="rounded-2xl border p-4 flex flex-wrap gap-6" style={{ borderColor: 'var(--light-gray)', background: '#fff' }}>
            {[[`Opening ${from}`, opening], ['Received (credits)', totalCr], ['Released (debits)', totalDr], ['Balance at end of range', closing]].map(([label, v]) => (
              <div key={label as string}>
                <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{label}</p>
                <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--charcoal)' }}>₱{peso(v as number)}</p>
              </div>
            ))}
          </div>

          {/* Monthly movement across the selected range (click a month to filter the lines) */}
          <div className="rounded-2xl border overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                  <th className="px-3 py-2 sticky left-0" style={{ background: 'var(--off-white)' }}></th>
                  {monthly.map(([k]) => (
                    <th key={k} className="px-2 py-2 text-right cursor-pointer whitespace-nowrap"
                      onClick={() => setMonthKey(monthKey === k ? '' : k)}
                      style={{ color: monthKey === k ? 'var(--teal)' : undefined }}>{monthLabel(k)}</th>
                  ))}
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-3 py-1.5 font-medium sticky left-0 bg-white">Credits (received)</td>
                  {monthly.map(([k, m]) => <td key={k} className="px-2 py-1.5 text-right">{m.cr ? peso(m.cr) : '—'}</td>)}
                  <td className="px-3 py-1.5 text-right font-semibold">{peso(totalCr)}</td>
                </tr>
                <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-3 py-1.5 font-medium sticky left-0 bg-white">Debits (released)</td>
                  {monthly.map(([k, m]) => <td key={k} className="px-2 py-1.5 text-right">{m.dr ? peso(m.dr) : '—'}</td>)}
                  <td className="px-3 py-1.5 text-right font-semibold">{peso(totalDr)}</td>
                </tr>
                <tr className="border-t font-semibold" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-3 py-1.5 sticky left-0 bg-white">Net</td>
                  {monthly.map(([k, m]) => <td key={k} className="px-2 py-1.5 text-right">{m.cr || m.dr ? peso(m.cr - m.dr) : '—'}</td>)}
                  <td className="px-3 py-1.5 text-right">{peso(totalCr - totalDr)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select value={src} onChange={e => setSrc(e.target.value)} className="px-2 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
              <option value="">All sources</option>
              {sources.map(s => <option key={s} value={s}>{SOURCE_LABEL[s] || s}</option>)}
            </select>
            {monthKey ? <button onClick={() => setMonthKey('')} className="text-xs underline" style={{ color: 'var(--teal)' }}>Clear month filter ({monthLabel(monthKey)})</button> : null}
            <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{shown.length.toLocaleString()} line(s)</span>
          </div>

          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                  <th className="px-3 py-2">Date</th><th className="px-3 py-2">Branch</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 500).map((l, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-1.5 tabular-nums text-xs">{String(l.date).slice(0, 10)}</td>
                    <td className="px-3 py-1.5 text-xs">{(BRANCHES.find(([v]) => v === l.branch)?.[1]) || l.branch || '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{SOURCE_LABEL[l.refType] || l.refType}</td>
                    <td className="px-3 py-1.5 max-w-lg truncate" style={{ color: 'var(--charcoal)' }}>{l.description || l.jeDescription}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.debit > 0 ? `₱${peso(l.debit)}` : ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.credit > 0 ? `₱${peso(l.credit)}` : ''}</td>
                  </tr>
                ))}
                {shown.length > 500 && (
                  <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td colSpan={6} className="px-3 py-2 text-xs text-center" style={{ color: 'var(--mid-gray)' }}>
                      Showing the first 500 of {shown.length.toLocaleString()} — click a month above or narrow the range to see the rest.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
