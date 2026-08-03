'use client'

// Unearned Revenue (4050) — the movement view. Money in before it is earned
// (package deposits, advance payments at cashiering) credits this account;
// consuming sessions and refunds debit it. This page shows that cycle:
// opening, monthly debit/credit movement, and every underlying line.
import { useEffect, useMemo, useState } from 'react'
import { Loader2, PiggyBank } from 'lucide-react'

interface Line { date: string; debit: number; credit: number; description: string; refType: string; jeDescription?: string }
const peso = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SOURCE_LABEL: Record<string, string> = {
  POS_ORDER: 'POS cashiering', POS_ORDER_REVERSAL: 'POS reversal', REFUND: 'Refund', MANUAL: 'Manual journal',
  BANK_REC: 'Bank rec', QB_LIAB_IMPORT: 'QB import', AR_PAYMENT: 'AR collection',
}

export default function UnearnedRevenuePage() {
  const year = new Date().getFullYear()
  const [lines, setLines] = useState<Line[]>([])
  const [opening, setOpening] = useState(0)
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState<number | 0>(0)
  const [src, setSrc] = useState('')

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/journal-entries?accountNumber=4050&year=${year}`)
        const d = await r.json()
        setLines((d.lines || []).map((l: Line) => ({ ...l, debit: Number(l.debit), credit: Number(l.credit) })))
        setOpening(Number(d.opening) || 0)
      } finally { setLoading(false) }
    })()
  }, [year])

  const monthly = useMemo(() => {
    const m = Array.from({ length: 12 }, () => ({ dr: 0, cr: 0 }))
    for (const l of lines) {
      const mi = new Date(l.date).getUTCMonth()
      m[mi].dr += l.debit; m[mi].cr += l.credit
    }
    return m
  }, [lines])
  const totalDr = monthly.reduce((s, m) => s + m.dr, 0)
  const totalCr = monthly.reduce((s, m) => s + m.cr, 0)
  const closing = opening + totalCr - totalDr

  const sources = useMemo(() => [...new Set(lines.map(l => l.refType))].sort(), [lines])
  const shown = lines.filter(l =>
    (!month || new Date(l.date).getUTCMonth() + 1 === month) && (!src || l.refType === src))

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
        <PiggyBank size={22} style={{ color: 'var(--teal)' }} /> Unearned Revenue
      </h1>
      <p className="text-xs max-w-3xl" style={{ color: 'var(--mid-gray)' }}>
        4050 holds money received before it is earned — package deposits and advance payments credit it at cashiering;
        consumed sessions and refunds debit it back out. Credits grow the liability, debits release it.
      </p>

      {loading ? <div className="py-10 text-center"><Loader2 className="animate-spin inline" size={22} /></div> : (
        <>
          <div className="rounded-2xl border p-4 flex flex-wrap gap-6" style={{ borderColor: 'var(--light-gray)', background: '#fff' }}>
            {[['Opening ' + year, opening], ['Received (credits)', totalCr], ['Released (debits)', totalDr], ['Balance now', closing]].map(([label, v]) => (
              <div key={label as string}>
                <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{label}</p>
                <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--charcoal)' }}>₱{peso(v as number)}</p>
              </div>
            ))}
          </div>

          {/* Monthly movement */}
          <div className="rounded-2xl border overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                  <th className="px-3 py-2"></th>
                  {MONTHS.map((m, i) => <th key={m} className="px-2 py-2 text-right cursor-pointer" onClick={() => setMonth(month === i + 1 ? 0 : i + 1)} style={{ color: month === i + 1 ? 'var(--teal)' : undefined }}>{m}</th>)}
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-3 py-1.5 font-medium">Credits (received)</td>
                  {monthly.map((m, i) => <td key={i} className="px-2 py-1.5 text-right">{m.cr ? peso(m.cr) : '—'}</td>)}
                  <td className="px-3 py-1.5 text-right font-semibold">{peso(totalCr)}</td>
                </tr>
                <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-3 py-1.5 font-medium">Debits (released)</td>
                  {monthly.map((m, i) => <td key={i} className="px-2 py-1.5 text-right">{m.dr ? peso(m.dr) : '—'}</td>)}
                  <td className="px-3 py-1.5 text-right font-semibold">{peso(totalDr)}</td>
                </tr>
                <tr className="border-t font-semibold" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-3 py-1.5">Net</td>
                  {monthly.map((m, i) => <td key={i} className="px-2 py-1.5 text-right">{m.cr || m.dr ? peso(m.cr - m.dr) : '—'}</td>)}
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
            {month ? <button onClick={() => setMonth(0)} className="text-xs underline" style={{ color: 'var(--teal)' }}>Clear month filter ({MONTHS[month - 1]})</button> : null}
            <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{shown.length.toLocaleString()} line(s)</span>
          </div>

          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                  <th className="px-3 py-2">Date</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 500).map((l, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-1.5 tabular-nums text-xs">{String(l.date).slice(0, 10)}</td>
                    <td className="px-3 py-1.5 text-xs">{SOURCE_LABEL[l.refType] || l.refType}</td>
                    <td className="px-3 py-1.5 max-w-lg truncate" style={{ color: 'var(--charcoal)' }}>{l.description || l.jeDescription}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.debit > 0 ? `₱${peso(l.debit)}` : ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.credit > 0 ? `₱${peso(l.credit)}` : ''}</td>
                  </tr>
                ))}
                {shown.length > 500 && (
                  <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td colSpan={5} className="px-3 py-2 text-xs text-center" style={{ color: 'var(--mid-gray)' }}>
                      Showing the first 500 of {shown.length.toLocaleString()} — use the month filter to narrow down.
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
