'use client'

// Contribution-margin analysis per department — a full department P&L down to
// net margin. Every department always shows; the page's branch tickboxes
// filter by branch. Rent AND other expenses are each allocated per branch by
// configurable percentages (the "Expense allocation" button, one tab each).
import { useEffect, useState } from 'react'
import { Loader2, SlidersHorizontal, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export type CmRow = {
  key: string; label: string
  gross: number; discounts: number; net: number; fees: number; cm: number; cmPct: number | null
  other: number; rent: number; nm: number; nmPct: number | null
}
export type CmPayload = {
  year: number; branch: string; rows: CmRow[]
  adminFees: number; untaggedFees: number
  rentTotal: number; rentByBranch: Record<string, number>; rentUnallocated: number
  otherUnallocated: number
  branchesMissingConfig: string[]
  branchesMissingOtherConfig: string[]
  notes: string[]
}

const ALLOC_BRANCHES = [
  { value: 'SBEA', label: 'East Branch' },
  { value: 'SBGH', label: 'Greenhills Branch' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
]
const ALLOC_DEPTS = ['PT', 'OT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS', 'TRAINING', 'RETAIL']
const DEPT_SHORT: Record<string, string> = {
  PT: 'PT', OT: 'OT', SLP: 'Speech', SPED: 'SPED', MD: 'Medical',
  PSYCHOLOGY: 'Psych', ORTHOSIS: 'Ortho', TRAINING: 'Training', RETAIL: 'Retail',
}

const CATEGORIES = [
  { value: 'RENT', label: 'Rent (8210 + 8211)' },
  { value: 'OTHER', label: 'Other expenses' },
]

function RentAllocationModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  // alloc[category][branch][dept] = "pct"
  const [alloc, setAlloc] = useState<Record<string, Record<string, Record<string, string>>>>({})
  const [cat, setCat] = useState('RENT')
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/reports/contribution/rent-allocation')
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (!j) return
        const a: Record<string, Record<string, Record<string, string>>> = {}
        for (const c of CATEGORIES) {
          a[c.value] = {}
          for (const b of ALLOC_BRANCHES) {
            a[c.value][b.value] = {}
            for (const d of ALLOC_DEPTS) {
              const v = j.allocations?.[c.value]?.[b.value]?.[d]
              a[c.value][b.value][d] = v != null ? String(v) : ''
            }
          }
        }
        setAlloc(a); setLoaded(true)
      })
      .finally(() => setLoading(false))
  }, [])

  const sumOf = (c: string, b: string) => ALLOC_DEPTS.reduce((s, d) => s + (parseFloat(alloc[c]?.[b]?.[d] || '') || 0), 0)

  const save = async () => {
    if (!loaded) { setError('The saved percentages did not load — not saving over them. Close and retry.'); return }
    setBusy(true); setError('')
    try {
      for (const c of CATEGORIES) {
        for (const b of ALLOC_BRANCHES) {
          const allocation: Record<string, number> = {}
          for (const d of ALLOC_DEPTS) {
            const v = parseFloat(alloc[c.value]?.[b.value]?.[d] || '')
            if (Number.isFinite(v) && v > 0) allocation[d] = v
          }
          const r = await fetch('/api/reports/contribution/rent-allocation', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ branch: b.value, category: c.value, allocation }),
          })
          if (!r.ok) { const j = await r.json().catch(() => ({})); setError(`${c.label} · ${b.label}: ${j.error || 'save failed'}`); setBusy(false); return }
        }
      }
      onSaved(); onClose()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Expense allocation by department</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>
          Per branch: what % each department carries. Rent (direct 8211 + indirect 8210) and the
          remaining expenses each have their own percentages. Each branch should total 100%;
          anything unallocated stays on its own line.
        </p>
        <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: 'var(--light-gray)' }}>
          {CATEGORIES.map(c => (
            <button key={c.value} onClick={() => setCat(c.value)}
              className="flex-1 py-2 px-3 rounded-lg text-sm font-medium"
              style={{ background: cat === c.value ? 'white' : 'transparent', color: cat === c.value ? 'var(--teal)' : 'var(--mid-gray)' }}>
              {c.label}
            </button>
          ))}
        </div>
        {loading ? <div className="py-10 text-center"><Loader2 className="animate-spin inline" size={18} /></div> : (
          <div className="space-y-4">
            {ALLOC_BRANCHES.map(b => (
              <div key={b.value} className="rounded-xl p-3" style={{ border: '1px solid var(--light-gray)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{b.label}</span>
                  <span className="text-xs tabular-nums" style={{ color: Math.abs(sumOf(cat, b.value) - 100) < 0.01 ? '#15803d' : sumOf(cat, b.value) > 100 ? '#b91c1c' : 'var(--mid-gray)' }}>
                    total {sumOf(cat, b.value).toFixed(1)}%
                  </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {ALLOC_DEPTS.map(d => (
                    <label key={d} className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                      {DEPT_SHORT[d]}
                      <div className="flex items-center gap-1">
                        <input
                          value={alloc[cat]?.[b.value]?.[d] ?? ''}
                          onChange={e => setAlloc(a => ({ ...a, [cat]: { ...a[cat], [b.value]: { ...a[cat]?.[b.value], [d]: e.target.value } } }))}
                          inputMode="decimal" placeholder="0"
                          className="w-full px-2 py-1.5 rounded-lg text-sm tabular-nums text-right"
                          style={{ border: '1px solid var(--light-gray)' }}
                        />
                        <span className="text-xs">%</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {error && <p className="text-xs mt-3" style={{ color: '#b91c1c' }}>{error}</p>}
        <button onClick={save} disabled={busy || loading}
          className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'var(--teal)' }}>
          {busy && <Loader2 size={15} className="animate-spin" />} Save allocation
        </button>
      </div>
    </div>
  )
}

export default function ContributionMargin({ year, branch, onData }: {
  year: number
  branch: string
  onData?: (d: CmPayload | null) => void
}) {
  const [reload, setReload] = useState(0)
  const key = `${year}|${branch}|${reload}`
  const [result, setResult] = useState<{ key: string; data: CmPayload | null; error: string | null }>({ key: '', data: null, error: null })
  const [showAlloc, setShowAlloc] = useState(false)

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
    other: a.other + r.other, rent: a.rent + r.rent, nm: a.nm + r.nm,
  }), { gross: 0, discounts: 0, net: 0, fees: 0, cm: 0, other: 0, rent: 0, nm: 0 })

  // Statement-style numbers: tabular-nums, whole pesos so every column fits
  // without horizontal scrolling.
  const fmt = (v: number) => Math.round(Math.abs(v)).toLocaleString('en-PH')
  const num = (v: number, bold: boolean, k: string) => (
    <td key={k} className={`px-2 py-1.5 text-right tabular-nums text-xs whitespace-nowrap ${bold ? 'font-semibold' : ''}`}
      style={{ color: v < 0 ? '#b91c1c' : bold ? '#111827' : 'var(--charcoal)' }}>
      {v < 0 ? `(${fmt(v)})` : fmt(v)}
    </td>
  )

  type Line = [string, (r: CmRow) => number, number, boolean]
  const lines: Line[] = [
    ['Gross Sales', r => r.gross, tot.gross, false],
    ['Discounts (allocated)', r => -r.discounts, -tot.discounts, false],
    ['Net Sales', r => r.net, tot.net, true],
    ['Professional Fees', r => -r.fees, -tot.fees, false],
    ['Contribution Margin', r => r.cm, tot.cm, true],
    ['Other Expenses (allocated)', r => -r.other, -tot.other, false],
    ['Rent (allocated)', r => -r.rent, -tot.rent, false],
    ['Net Margin', r => r.nm, tot.nm, true],
  ]

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Amounts in whole pesos.</p>
        <button onClick={() => setShowAlloc(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}>
          <SlidersHorizontal size={13} /> Expense allocation
        </button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
        <table className="w-full table-auto">
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th className="px-2 py-1.5 text-left text-[11px] font-semibold" style={{ color: '#334155' }}>Line Item</th>
              {shown.map(r => (
                <th key={r.key} className="px-2 py-1.5 text-right text-[11px] font-semibold" style={{ color: '#334155' }}>{r.label}</th>
              ))}
              <th className="px-2 py-1.5 text-right text-[11px] font-semibold" style={{ color: '#334155', borderLeft: '2px solid #94a3b8' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(([label, get, total, bold]) => (
              <tr key={label} style={{ borderTop: bold ? '2px solid #94a3b8' : '1px solid var(--light-gray)', background: bold ? '#f8fafc' : undefined }}>
                <td className={`px-2 py-1.5 text-xs whitespace-nowrap ${bold ? 'font-semibold' : ''}`} style={{ color: 'var(--charcoal)' }}>{label}</td>
                {shown.map(r => num(get(r), bold, r.key))}
                <td className="px-2 py-1.5 text-right tabular-nums text-xs font-semibold whitespace-nowrap"
                  style={{ color: total < 0 ? '#b91c1c' : '#111827', borderLeft: '2px solid #94a3b8' }}>
                  {total < 0 ? `(${fmt(total)})` : fmt(total)}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid var(--light-gray)' }}>
              <td className="px-2 py-1.5 text-xs" style={{ color: 'var(--charcoal)' }}>Net Margin % of Net Sales</td>
              {shown.map(r => (
                <td key={r.key} className="px-2 py-1.5 text-right tabular-nums text-xs" style={{ color: r.nmPct != null && r.nmPct < 0 ? '#b91c1c' : 'var(--mid-gray)' }}>
                  {r.nmPct != null ? `${r.nmPct.toFixed(1)}%` : '—'}
                </td>
              ))}
              <td className="px-2 py-1.5 text-right tabular-nums text-xs font-semibold" style={{ color: '#111827', borderLeft: '2px solid #94a3b8' }}>
                {tot.net > 0 ? `${((tot.nm / tot.net) * 100).toFixed(1)}%` : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs space-y-1" style={{ color: 'var(--mid-gray)' }}>
        {data.adminFees > 0 && <div>Administration consultants (overhead, no department): <span className="tabular-nums">{formatCurrency(data.adminFees)}</span></div>}
        {Math.abs(data.untaggedFees) > 0.5 && <div>Professional fees not yet department-tagged (pre-April-2026 cutoffs, manual entries): <span className="tabular-nums">{formatCurrency(data.untaggedFees)}</span></div>}
        {data.rentUnallocated > 0.5 && <div>Rent not covered by the allocation percentages: <span className="tabular-nums">{formatCurrency(data.rentUnallocated)}</span></div>}
        {data.otherUnallocated > 0.5 && <div>Other expenses not covered by the allocation percentages: <span className="tabular-nums">{formatCurrency(data.otherUnallocated)}</span></div>}
        {data.branchesMissingConfig.length > 0 && (
          <div style={{ color: '#b45309' }}>
            No rent allocation configured for {data.branchesMissingConfig.join(', ')} — split equally for now (&quot;Expense allocation&quot; button, Rent tab).
          </div>
        )}
        {(data.branchesMissingOtherConfig || []).length > 0 && (
          <div style={{ color: '#b45309' }}>
            No other-expense allocation configured for {(data.branchesMissingOtherConfig || []).join(', ')} — split equally for now (&quot;Expense allocation&quot; button, Other tab).
          </div>
        )}
      </div>

      <div className="mt-4 space-y-1">
        {data.notes.map((n, i) => <p key={i} className="text-[11px]" style={{ color: '#94a3b8' }}>{n}</p>)}
      </div>

      {showAlloc && <RentAllocationModal onClose={() => setShowAlloc(false)} onSaved={() => setReload(x => x + 1)} />}
    </div>
  )
}
