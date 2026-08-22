'use client'

// Contribution-margin analysis per department: gross sales → net sales →
// less that department's professional fees → contribution toward fixed costs.
// Every department always shows; the page's branch tickboxes filter by branch.
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export type CmRow = {
  key: string; label: string
  gross: number; discounts: number; net: number; fees: number; cm: number; cmPct: number | null
}
export type CmPayload = {
  year: number; branch: string; rows: CmRow[]
  adminFees: number; untaggedFees: number; notes: string[]
}

export default function ContributionMargin({ year, branch, onData }: {
  year: number
  branch: string
  onData?: (d: CmPayload | null) => void
}) {
  const key = `${year}|${branch}`
  const [result, setResult] = useState<{ key: string; data: CmPayload | null; error: string | null }>({ key: '', data: null, error: null })

  useEffect(() => {
    let live = true
    fetch(`/api/reports/contribution?year=${year}&branch=${encodeURIComponent(branch)}`)
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
  if (loading) return <div className="flex items-center justify-center py-16 gap-2 text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={18} className="animate-spin" /> Computing contribution analysis…</div>
  if (result.error || !data) return <div className="py-16 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>{result.error || 'No data'}</div>

  const shown = data.rows
  const tot = shown.reduce((a, r) => ({
    gross: a.gross + r.gross, discounts: a.discounts + r.discounts,
    net: a.net + r.net, fees: a.fees + r.fees, cm: a.cm + r.cm,
  }), { gross: 0, discounts: 0, net: 0, fees: 0, cm: 0 })
  const num = (v: number, bold = false) => (
    <td className={`px-3 py-2 text-right font-mono text-sm ${bold ? 'font-bold' : ''}`} style={{ color: v < 0 ? '#b91c1c' : 'var(--charcoal)' }}>
      {v < 0 ? `(${formatCurrency(Math.abs(v))})` : formatCurrency(v)}
    </td>
  )

  return (
    <div className="px-4 pb-4">
      <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--light-gray)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Department', 'Gross Sales', 'Discounts (allocated)', 'Net Sales', 'Professional Fees', 'Contribution Margin', 'CM %'].map((h, i) => (
                <th key={h} className={`px-3 py-2 text-xs font-semibold ${i === 0 ? 'text-left' : 'text-right'}`} style={{ color: '#334155' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.key} style={{ borderTop: '1px solid var(--light-gray)' }}>
                <td className="px-3 py-2 text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{r.label}</td>
                {num(r.gross)}{num(-r.discounts)}{num(r.net)}{num(-r.fees)}{num(r.cm, true)}
                <td className="px-3 py-2 text-right font-mono text-sm" style={{ color: r.cmPct != null && r.cmPct < 0 ? '#b91c1c' : 'var(--mid-gray)' }}>
                  {r.cmPct != null ? `${r.cmPct.toFixed(1)}%` : '—'}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid #94a3b8', background: '#f8fafc' }}>
              <td className="px-3 py-2 text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Total — all departments</td>
              {num(tot.gross, true)}{num(-tot.discounts, true)}{num(tot.net, true)}{num(-tot.fees, true)}{num(tot.cm, true)}
              <td className="px-3 py-2 text-right font-mono text-sm font-bold" style={{ color: 'var(--charcoal)' }}>
                {tot.net > 0 ? `${((tot.cm / tot.net) * 100).toFixed(1)}%` : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Fees that belong to no department — shown so the analysis ties to the books */}
      {(data.adminFees > 0 || Math.abs(data.untaggedFees) > 0.5) && (
        <div className="mt-3 text-xs space-y-1" style={{ color: 'var(--mid-gray)' }}>
          {data.adminFees > 0 && <div>Administration consultants (overhead, no department): <span className="font-mono">{formatCurrency(data.adminFees)}</span></div>}
          {Math.abs(data.untaggedFees) > 0.5 && <div>Professional fees on the books not yet department-tagged (pre-April-2026 cutoffs, manual entries): <span className="font-mono">{formatCurrency(data.untaggedFees)}</span></div>}
        </div>
      )}

      <div className="mt-4 space-y-1">
        {data.notes.map((n, i) => <p key={i} className="text-[11px]" style={{ color: '#94a3b8' }}>{n}</p>)}
      </div>
    </div>
  )
}
