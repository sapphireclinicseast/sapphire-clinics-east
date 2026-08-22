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
              <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: '#334155' }}>Line Item</th>
              {shown.map(r => (
                <th key={r.key} className="px-3 py-2 text-right text-xs font-semibold whitespace-nowrap" style={{ color: '#334155' }}>{r.label}</th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: '#334155', borderLeft: '2px solid #94a3b8' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {([
              ['Gross Sales', (r: CmRow) => r.gross, tot.gross, false],
              ['Discounts (allocated)', (r: CmRow) => -r.discounts, -tot.discounts, false],
              ['Net Sales', (r: CmRow) => r.net, tot.net, true],
              ['Professional Fees', (r: CmRow) => -r.fees, -tot.fees, false],
              ['Contribution Margin', (r: CmRow) => r.cm, tot.cm, true],
            ] as [string, (r: CmRow) => number, number, boolean][]).map(([label, get, total, bold]) => (
              <tr key={label} style={{ borderTop: bold ? '2px solid #94a3b8' : '1px solid var(--light-gray)', background: bold ? '#f8fafc' : undefined }}>
                <td className={`px-3 py-2 text-sm ${bold ? 'font-bold' : 'font-medium'}`} style={{ color: 'var(--charcoal)' }}>{label}</td>
                {shown.map(r => num(get(r), bold))}
                <td className="px-3 py-2 text-right font-mono text-sm font-bold" style={{ color: total < 0 ? '#b91c1c' : 'var(--charcoal)', borderLeft: '2px solid #94a3b8' }}>
                  {total < 0 ? `(${formatCurrency(Math.abs(total))})` : formatCurrency(total)}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid var(--light-gray)' }}>
              <td className="px-3 py-2 text-sm font-medium" style={{ color: 'var(--charcoal)' }}>CM % of Net Sales</td>
              {shown.map(r => (
                <td key={r.key} className="px-3 py-2 text-right font-mono text-sm" style={{ color: r.cmPct != null && r.cmPct < 0 ? '#b91c1c' : 'var(--mid-gray)' }}>
                  {r.cmPct != null ? `${r.cmPct.toFixed(1)}%` : '—'}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-mono text-sm font-bold" style={{ color: 'var(--charcoal)', borderLeft: '2px solid #94a3b8' }}>
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
