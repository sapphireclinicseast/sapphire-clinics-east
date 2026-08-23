'use client'

/* Graphs — monthly income-statement metrics as lines over time.
 *
 * Data comes straight from the ledger engine (/api/reports/v2), one fetch per
 * (year, branch); the five metrics are derived from incomeStatement.sections
 * with EXACTLY the same arithmetic LedgerStatements uses for its monthly IS
 * columns, so a point on a line always equals the number printed on the
 * statement for that month.
 *
 * Branch tickboxes: all ticked → the combined books (branch=ALL, which also
 * carries entries tagged to no single branch); a subset → the ticked branch
 * views summed. Confidentiality: this view never requests drill-downs, so no
 * patient-level data is ever fetched.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, TrendingUp, Table2 } from 'lucide-react'
import { INCOME_TAX_RATE } from '@/lib/reports/income-statement-totals'

/* ── data plumbing ─────────────────────────────────────────────── */

interface EngineIS {
  incomeStatement: { sections: { key: string; rows: { monthly?: number[] }[] }[] }
}

const METRICS = [
  { key: 'grossSales', label: 'Gross Sales' },
  { key: 'netSales', label: 'Net Sales' },
  { key: 'grossProfit', label: 'Gross Profit' },
  { key: 'ebitda', label: 'EBITDA' },
  { key: 'netIncome', label: 'Net Income' },
] as const
type MetricKey = typeof METRICS[number]['key']

/* Validated categorical palette (dataviz reference, slots 1–5, light mode).
   Fixed slot per metric — filters/toggles never repaint survivors. */
const SERIES_COLOR: Record<MetricKey, string> = {
  grossSales: '#2a78d6',   // blue
  netSales: '#eb6834',     // orange
  grossProfit: '#1baf7a',  // aqua
  ebitda: '#eda100',       // yellow
  netIncome: '#e87ba4',    // magenta
}

const GRAPH_BRANCHES = [
  { value: 'SBEA', label: 'East' },
  { value: 'SBGH', label: 'Greenhills' },
  { value: 'VERDANA_STORE', label: 'Verdana' },
]

const MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Engine-mirroring derivation: 12 months of the five metrics for one payload. */
function deriveMetrics(data: EngineIS): Record<MetricKey, number[]> {
  const sec = (key: string) => data.incomeStatement.sections.find(s => s.key === key)
  const secM = (key: string) =>
    Array.from({ length: 12 }, (_, i) => (sec(key)?.rows || []).reduce((sum, r) => sum + (r.monthly?.[i] || 0), 0))
  const rev = secM('REVENUE'), disc = secM('DISCOUNTS'), cogs = secM('COGS'), opex = secM('OPEX')
  const dep = secM('DEPRECIATION'), int = secM('INTEREST'), nonop = secM('NON_OPERATING')
  const netSales = rev.map((r, i) => r - disc[i])
  const grossProfit = netSales.map((n, i) => n - cogs[i])
  const ebitda = grossProfit.map((g, i) => g - opex[i])
  const netIncome = ebitda.map((e, i) => (e - dep[i] - int[i] - nonop[i]) * (1 - INCOME_TAX_RATE))
  return { grossSales: rev, netSales, grossProfit, ebitda, netIncome }
}

const fmtPeso = (v: number) => {
  const a = Math.abs(v)
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`
    : a >= 1_000 ? `${(a / 1_000).toFixed(0)}K`
    : a.toFixed(0)
  return `${v < 0 ? '−' : ''}₱${s}`
}
const fmtFull = (v: number) =>
  `${v < 0 ? '−' : ''}₱${Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/* ── component ─────────────────────────────────────────────────── */

export default function GraphsView() {
  const now = new Date()
  const curYear = now.getFullYear()
  // Last closed month of the current year (a month that has not happened — or
  // only started — has no complete position to chart).
  const lastRealMonth = now.getMonth() + 1
  const years = Array.from({ length: curYear - 2024 + 1 }, (_, i) => 2024 + i)

  const [fromY, setFromY] = useState(curYear)
  const [fromM, setFromM] = useState(1)
  const [toY, setToY] = useState(curYear)
  const [toM, setToM] = useState(lastRealMonth)
  const [ticked, setTicked] = useState<string[]>(GRAPH_BRANCHES.map(b => b.value))
  const [hidden, setHidden] = useState<MetricKey[]>([])
  const [showTable, setShowTable] = useState(false)

  // All branches ticked = the combined books (includes company-wide entries).
  const allTicked = ticked.length === GRAPH_BRANCHES.length
  const branchesToFetch = allTicked ? ['ALL'] : ticked

  // (year|branch) → derived metrics; fetched on demand, kept for the session.
  const [cache, setCache] = useState<Record<string, Record<MetricKey, number[]>>>({})
  const [loadingN, setLoadingN] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef(cache)
  cacheRef.current = cache
  // Keys currently being fetched. Without this, every re-render while a slow
  // engine request is in flight fired ANOTHER copy of the same request — the
  // server ended up running dozens of duplicate ledger computations and the
  // spinner never resolved.
  const inflight = useRef(new Set<string>())

  const yearSpan = useMemo(() => {
    const ys: number[] = []
    for (let y = Math.min(fromY, toY); y <= Math.max(fromY, toY); y++) ys.push(y)
    return ys
  }, [fromY, toY])

  // Stable dependency: the exact set of (year|branch) payloads this view needs.
  const wantKey = yearSpan.flatMap(y => branchesToFetch.map(b => `${y}|${b}`)).join(',')
  useEffect(() => {
    if (ticked.length === 0) return
    const need = wantKey.split(',').filter(k => k && !cacheRef.current[k] && !inflight.current.has(k))
    if (!need.length) return
    setLoadingN(n => n + need.length)
    setError(null)
    need.forEach(k => {
      inflight.current.add(k)
      const [y, b] = k.split('|')
      fetch(`/api/reports/v2?year=${y}&branch=${b}`)
        .then(async r => {
          const j = await r.json()
          if (!r.ok) throw new Error(j.error || 'Failed to load')
          setCache(c => ({ ...c, [k]: deriveMetrics(j) }))
        })
        .catch(e => setError(e.message || 'Failed to load'))
        .finally(() => { inflight.current.delete(k); setLoadingN(n => n - 1) })
    })
  }, [wantKey, ticked.length]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Assemble the charted point list: month range × summed ticked branches. */
  const points = useMemo(() => {
    const out: { y: number; m: number; label: string; values: Record<MetricKey, number> | null }[] = []
    const lo = fromY * 12 + (fromM - 1), hi = toY * 12 + (toM - 1)
    for (let t = Math.min(lo, hi); t <= Math.max(lo, hi); t++) {
      const y = Math.floor(t / 12), m = (t % 12) + 1
      if (y === curYear && m > lastRealMonth) continue
      const payloads = branchesToFetch.map(b => cache[`${y}|${b}`])
      if (payloads.some(p => !p)) { out.push({ y, m, label: `${MONTHS_S[m - 1]} ${String(y).slice(2)}`, values: null }); continue }
      const values = {} as Record<MetricKey, number>
      for (const { key } of METRICS) values[key] = payloads.reduce((s, p) => s + (p as Record<MetricKey, number[]>)[key][m - 1], 0)
      out.push({ y, m, label: `${MONTHS_S[m - 1]} ${String(y).slice(2)}`, values })
    }
    return out
  }, [cache, fromY, fromM, toY, toM, branchesToFetch, curYear, lastRealMonth])

  const ready = points.length > 0 && points.every(p => p.values !== null)
  const [hover, setHover] = useState<number | null>(null)

  /* ── chart geometry ── */
  const W = 980, H = 420, PAD_L = 76, PAD_R = 130, PAD_T = 16, PAD_B = 40
  const activeMetrics = METRICS.filter(mt => !hidden.includes(mt.key))
  const chart = useMemo(() => {
    if (!ready) return null
    let lo = 0, hi = 0
    for (const p of points) for (const mt of activeMetrics) {
      const v = p.values![mt.key]
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    if (hi === lo) hi = lo + 1
    const span = hi - lo
    hi += span * 0.06; lo -= span * 0.06
    const x = (i: number) => points.length === 1 ? (PAD_L + (W - PAD_L - PAD_R) / 2)
      : PAD_L + (i * (W - PAD_L - PAD_R)) / (points.length - 1)
    const yOf = (v: number) => PAD_T + ((hi - v) * (H - PAD_T - PAD_B)) / (hi - lo)
    // ~5 round gridlines
    const rawStep = (hi - lo) / 5
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
    const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => s >= rawStep) || rawStep
    const gridStart = Math.ceil(lo / step) * step
    const grid: number[] = []
    for (let g = gridStart; g <= hi; g += step) grid.push(g)
    return { x, yOf, grid, lo, hi }
  }, [ready, points, activeMetrics])

  const toggleBranch = (v: string) =>
    setTicked(t => t.includes(v) ? t.filter(x => x !== v) : [...t, v])
  const toggleMetric = (k: MetricKey) =>
    setHidden(h => h.includes(k) ? h.filter(x => x !== k) : [...h, k])

  const selStyle: React.CSSProperties = {
    border: '1px solid var(--light-gray)', color: 'var(--charcoal)', background: 'white',
  }

  /* every-nth x label so they never collide */
  const xEvery = Math.max(1, Math.ceil(points.length / 16))

  return (
    <div>
      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4 print:hidden">
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--charcoal)' }}>
          <span style={{ color: 'var(--mid-gray)' }}>From</span>
          <select value={fromM} onChange={e => setFromM(+e.target.value)} className="px-2 py-2 rounded-lg text-sm" style={selStyle}>
            {MONTHS_S.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={fromY} onChange={e => setFromY(+e.target.value)} className="px-2 py-2 rounded-lg text-sm" style={selStyle}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span style={{ color: 'var(--mid-gray)' }}>to</span>
          <select value={toM} onChange={e => setToM(+e.target.value)} className="px-2 py-2 rounded-lg text-sm" style={selStyle}>
            {MONTHS_S.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={toY} onChange={e => setToY(+e.target.value)} className="px-2 py-2 rounded-lg text-sm" style={selStyle}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ border: '1px solid var(--light-gray)', background: 'white' }}>
          {GRAPH_BRANCHES.map(b => (
            <label key={b.value} className="flex items-center gap-1.5 text-sm cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}>
              <input type="checkbox" checked={ticked.includes(b.value)} onChange={() => toggleBranch(b.value)} />
              {b.label}
            </label>
          ))}
        </div>

        <button onClick={() => setShowTable(s => !s)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
          style={{ border: '1px solid var(--light-gray)', color: showTable ? 'var(--teal)' : 'var(--charcoal)', background: 'white' }}>
          <Table2 size={15} /> Table
        </button>

        {loadingN > 0 && <Loader2 className="animate-spin" size={18} style={{ color: 'var(--teal)' }} />}
      </div>

      {allTicked
        ? <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>All branches — the combined books, including company-wide entries not tagged to a single branch.</p>
        : <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>Sum of the ticked branch views. Company-wide entries (branch “ALL”) appear only when every branch is ticked.</p>}

      {/* ── Chart card ── */}
      <div className="rounded-xl p-4" style={{ background: 'white', border: '1px solid var(--light-gray)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={16} style={{ color: 'var(--teal)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
            Monthly Income Statement Metrics
          </span>
        </div>

        {/* Legend — identity, clickable to hide/show; colors never move between metrics */}
        <div className="flex flex-wrap gap-3 mb-2">
          {METRICS.map(mt => {
            const off = hidden.includes(mt.key)
            return (
              <button key={mt.key} onClick={() => toggleMetric(mt.key)}
                className="flex items-center gap-1.5 text-xs select-none"
                style={{ color: off ? '#b6b5b0' : 'var(--charcoal)', textDecoration: off ? 'line-through' : 'none' }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: off ? '#d6d5d0' : SERIES_COLOR[mt.key], display: 'inline-block' }} />
                {mt.label}
              </button>
            )
          })}
        </div>

        {ticked.length === 0 && (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>Tick at least one branch.</div>
        )}
        {error && ticked.length > 0 && (
          <div className="py-16 text-center text-sm" style={{ color: '#b91c1c' }}>{error}</div>
        )}
        {!error && ticked.length > 0 && !ready && (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
            <Loader2 className="animate-spin inline mr-2" size={16} />Loading ledger data…
          </div>
        )}

        {!error && ready && chart && (
          <div style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 640, display: 'block' }}
              onMouseLeave={() => setHover(null)}
              onMouseMove={e => {
                const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
                const px = ((e.clientX - rect.left) / rect.width) * W
                let best = 0, bd = Infinity
                points.forEach((_, i) => { const d = Math.abs(chart.x(i) - px); if (d < bd) { bd = d; best = i } })
                setHover(bd < 40 ? best : null)
              }}>
              {/* grid + y labels (recessive) */}
              {chart.grid.map(g => (
                <g key={g}>
                  <line x1={PAD_L} x2={W - PAD_R} y1={chart.yOf(g)} y2={chart.yOf(g)}
                    stroke={Math.abs(g) < 1e-9 ? '#c8c7c2' : '#ececea'} strokeWidth={1} />
                  <text x={PAD_L - 8} y={chart.yOf(g) + 3.5} textAnchor="end" fontSize={11} fill="#7a7975">{fmtPeso(g)}</text>
                </g>
              ))}
              {/* x labels */}
              {points.map((p, i) => (i % xEvery === 0 || i === points.length - 1) && (
                <text key={`${p.y}-${p.m}`} x={chart.x(i)} y={H - PAD_B + 18} textAnchor="middle" fontSize={11} fill="#7a7975">{p.label}</text>
              ))}
              {/* crosshair */}
              {hover !== null && (
                <line x1={chart.x(hover)} x2={chart.x(hover)} y1={PAD_T} y2={H - PAD_B} stroke="#c8c7c2" strokeWidth={1} strokeDasharray="3 3" />
              )}
              {/* series lines, 2px; direct label at line end */}
              {activeMetrics.map(mt => {
                const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${chart.x(i).toFixed(1)},${chart.yOf(p.values![mt.key]).toFixed(1)}`).join(' ')
                const last = points[points.length - 1]
                return (
                  <g key={mt.key}>
                    <path d={d} fill="none" stroke={SERIES_COLOR[mt.key]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    <text x={W - PAD_R + 8} y={chart.yOf(last.values![mt.key]) + 4} fontSize={11.5} fontWeight={600} fill="#3d3c39">{mt.label}</text>
                    {hover !== null && (
                      <circle cx={chart.x(hover)} cy={chart.yOf(points[hover].values![mt.key])} r={4.5}
                        fill={SERIES_COLOR[mt.key]} stroke="white" strokeWidth={2} />
                    )}
                  </g>
                )
              })}
              {/* hover hit strip (bigger than marks) */}
              <rect x={PAD_L} y={PAD_T} width={W - PAD_L - PAD_R} height={H - PAD_T - PAD_B} fill="transparent" />
            </svg>

            {/* tooltip readout row */}
            <div className="mt-1 px-2 py-2 rounded-lg text-xs flex flex-wrap gap-x-5 gap-y-1"
              style={{ background: '#f7f7f6', border: '1px solid #ececea', color: 'var(--charcoal)', minHeight: 34 }}>
              {hover !== null ? (
                <>
                  <span className="font-semibold">{points[hover].label}</span>
                  {activeMetrics.map(mt => (
                    <span key={mt.key} className="flex items-center gap-1.5">
                      <span style={{ width: 10, height: 3, borderRadius: 2, background: SERIES_COLOR[mt.key], display: 'inline-block' }} />
                      {mt.label}: <span className="tabular-nums font-medium">{fmtFull(points[hover].values![mt.key])}</span>
                    </span>
                  ))}
                </>
              ) : <span style={{ color: 'var(--mid-gray)' }}>Hover the chart to read exact values.</span>}
            </div>
          </div>
        )}

        {/* accessible table view */}
        {showTable && ready && (
          <div className="mt-4 overflow-x-auto">
            <table className="text-xs w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', color: '#374151' }}>
                  <th className="text-left py-1.5 pr-3">Month</th>
                  {METRICS.map(mt => <th key={mt.key} className="text-right py-1.5 px-3">{mt.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {points.map(p => (
                  <tr key={`${p.y}-${p.m}`} style={{ borderBottom: '1px solid #f1f1f0' }}>
                    <td className="py-1 pr-3" style={{ color: '#374151' }}>{p.label}</td>
                    {METRICS.map(mt => (
                      <td key={mt.key} className="text-right py-1 px-3 tabular-nums" style={{ color: '#111827' }}>
                        {p.values ? fmtFull(p.values[mt.key]) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
