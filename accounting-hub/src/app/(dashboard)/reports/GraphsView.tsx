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
import { Loader2, TrendingUp, Table2, Megaphone } from 'lucide-react'
import { StatCard } from '@/components/ui/hr-look'
import { INCOME_TAX_RATE } from '@/lib/reports/income-statement-totals'

/* ── data plumbing ─────────────────────────────────────────────── */

/* Look (Hannah 2026-11-11, "this looks horrible"): summary tiles for the range,
 * a sales-and-profit line chart with a floating tooltip and no colliding
 * end labels, and Marketing & Ads on its own bar chart (its scale is ~40x
 * smaller, so it flat-lined on the shared axis). A month still in progress
 * is drawn dashed and labelled "to date" instead of reading as a collapse. */

interface EngineIS {
  incomeStatement: { sections: { key: string; rows: { number?: string; monthly?: number[] }[] }[] }
}

const METRICS = [
  { key: 'grossSales', label: 'Gross Sales' },
  { key: 'netSales', label: 'Net Sales' },
  { key: 'grossProfit', label: 'Gross Profit' },
  { key: 'ebitda', label: 'EBITDA' },
  { key: 'netIncome', label: 'Net Income' },
  { key: 'marketing', label: 'Marketing & Ads (8120)' },
] as const
type MetricKey = typeof METRICS[number]['key']

/* Validated categorical palette (dataviz reference, slots 1–6, light mode).
   Fixed slot per metric — filters/toggles never repaint survivors. */
const SERIES_COLOR: Record<MetricKey, string> = {
  grossSales: '#2a78d6',   // blue
  netSales: '#eb6834',     // orange
  grossProfit: '#1baf7a',  // aqua
  ebitda: '#eda100',       // yellow
  netIncome: '#e87ba4',    // magenta
  marketing: '#008300',    // green
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
  // Single-account overlay: 8120 Marketing and Advertising Expense (inside OPEX),
  // charted alongside the sales lines to show how ad spend tracks sales.
  const marketing = Array.from({ length: 12 }, (_, i) =>
    data.incomeStatement.sections.reduce((sum, s) =>
      sum + s.rows.filter(r => r.number === '8120').reduce((a, r) => a + (r.monthly?.[i] || 0), 0), 0))
  return { grossSales: rev, netSales, grossProfit, ebitda, netIncome, marketing }
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

const LINE_METRICS = METRICS.filter(m => m.key !== 'marketing')
type LineKey = Exclude<MetricKey, 'marketing'>
const GRID = '#ececea'
const ZERO = '#c8c7c2'
const AXIS_TXT = '#7a7975'

/** Round gridlines (~5) over [lo, hi]. */
function niceGrid(lo: number, hi: number) {
  if (hi === lo) hi = lo + 1
  // About six bands, and the grid brackets the data so the top line sits above the peak.
  const rawStep = (hi - lo) / 6
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => s >= rawStep) || rawStep
  const grid: number[] = []
  const end = Math.ceil(hi / step - 1e-9) * step
  for (let g = Math.floor(lo / step + 1e-9) * step; g <= end + step * 1e-6; g += step) grid.push(Math.abs(g) < step * 1e-6 ? 0 : g)
  return grid
}
const pct = (num: number, den: number) => (den ? `${((num / den) * 100).toFixed(1)}%` : '—')

export default function GraphsView() {
  const now = new Date()
  const curYear = now.getFullYear()
  const curMonth = now.getMonth() + 1
  // The default range ends at the last FULL month; the current month can still be
  // picked, and is then drawn as "to date" rather than as a real month-end figure.
  const lastFullY = curMonth === 1 ? curYear - 1 : curYear
  const lastFullM = curMonth === 1 ? 12 : curMonth - 1
  const years = Array.from({ length: curYear - 2024 + 1 }, (_, i) => 2024 + i)

  const [fromY, setFromY] = useState(lastFullY)
  const [fromM, setFromM] = useState(1)
  const [toY, setToY] = useState(lastFullY)
  const [toM, setToM] = useState(lastFullM)
  const [ticked, setTicked] = useState<string[]>(GRAPH_BRANCHES.map(b => b.value))
  const [hidden, setHidden] = useState<LineKey[]>([])
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
    const out: { y: number; m: number; label: string; partial: boolean; values: Record<MetricKey, number> | null }[] = []
    const lo = fromY * 12 + (fromM - 1), hi = toY * 12 + (toM - 1)
    for (let t = Math.min(lo, hi); t <= Math.max(lo, hi); t++) {
      const y = Math.floor(t / 12), m = (t % 12) + 1
      if (y > curYear || (y === curYear && m > curMonth)) continue
      const partial = y === curYear && m === curMonth
      const label = `${MONTHS_S[m - 1]} ${String(y).slice(2)}`
      const payloads = branchesToFetch.map(b => cache[`${y}|${b}`])
      if (payloads.some(p => !p)) { out.push({ y, m, label, partial, values: null }); continue }
      const values = {} as Record<MetricKey, number>
      for (const { key } of METRICS) values[key] = payloads.reduce((s, p) => s + (p as Record<MetricKey, number[]>)[key][m - 1], 0)
      out.push({ y, m, label, partial, values })
    }
    return out
  }, [cache, fromY, fromM, toY, toM, branchesToFetch, curYear, curMonth])

  const ready = points.length > 0 && points.every(p => p.values !== null)
  const hasPartial = points.some(p => p.partial)
  const [hover, setHover] = useState<number | null>(null)
  const [barHover, setBarHover] = useState<number | null>(null)

  /* totals over the range, for the tiles */
  const totals = useMemo(() => {
    const t = Object.fromEntries(METRICS.map(m => [m.key, 0])) as Record<MetricKey, number>
    if (ready) for (const p of points) for (const { key } of METRICS) t[key] += p.values![key]
    return t
  }, [ready, points])

  /* ── line chart geometry ── */
  const W = 980, H = 380, PAD_L = 64, PAD_R = 24, PAD_T = 18, PAD_B = 36
  const activeLines = LINE_METRICS.filter(mt => !hidden.includes(mt.key as LineKey))
  const xAt = (i: number) => points.length === 1 ? (PAD_L + (W - PAD_L - PAD_R) / 2)
    : PAD_L + (i * (W - PAD_L - PAD_R)) / (points.length - 1)
  const chart = useMemo(() => {
    if (!ready) return null
    let lo = 0, hi = 0
    for (const p of points) for (const mt of activeLines) {
      const v = p.values![mt.key]
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    const grid = niceGrid(lo, hi)
    const gLo = Math.min(lo, grid[0]), gHi = Math.max(hi, grid[grid.length - 1])
    const yOf = (v: number) => PAD_T + ((gHi - v) * (H - PAD_T - PAD_B)) / (gHi - gLo || 1)
    return { yOf, grid }
  }, [ready, points, activeLines])

  /* ── marketing bars geometry ── */
  const BH = 224, BPAD_T = 14, BPAD_B = 36
  const bars = useMemo(() => {
    if (!ready) return null
    const vals = points.map(p => p.values!.marketing)
    const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals)
    const grid = niceGrid(lo, hi || 1)
    const gLo = Math.min(lo, grid[0]), gHi = Math.max(hi, grid[grid.length - 1])
    const yOf = (v: number) => BPAD_T + ((gHi - v) * (BH - BPAD_T - BPAD_B)) / (gHi - gLo || 1)
    const slot = (W - PAD_L - PAD_R) / points.length
    const bw = Math.max(4, Math.min(24, slot * 0.56))
    const cx = (i: number) => PAD_L + slot * (i + 0.5)
    return { yOf, grid, slot, bw, cx }
  }, [ready, points])

  const toggleBranch = (v: string) =>
    setTicked(t => t.includes(v) ? t.filter(x => x !== v) : [...t, v])
  const toggleMetric = (k: LineKey) =>
    setHidden(h => h.includes(k) ? h.filter(x => x !== k) : [...h, k])

  const selStyle: React.CSSProperties = {
    border: '1px solid var(--light-gray)', color: 'var(--charcoal)', background: 'white',
  }
  const card: React.CSSProperties = { background: 'white', border: '1px solid var(--light-gray)' }

  /* every-nth x label so they never collide */
  const xEvery = Math.max(1, Math.ceil(points.length / 12))
  const xLabel = (i: number) => (i % xEvery === 0 || i === points.length - 1)

  /* line path for one metric; the segment into a month still in progress is dashed */
  const linePaths = (key: LineKey) => {
    if (!chart) return { solid: '', dashed: '' }
    const n = points.length
    const lastPartial = points[n - 1]?.partial
    const solidEnd = lastPartial ? n - 1 : n
    const pt = (i: number) => `${xAt(i).toFixed(1)},${chart.yOf(points[i].values![key]).toFixed(1)}`
    const solid = Array.from({ length: solidEnd }, (_, i) => `${i === 0 ? 'M' : 'L'}${pt(i)}`).join(' ')
    const dashed = lastPartial && n > 1 ? `M${pt(n - 2)} L${pt(n - 1)}` : ''
    return { solid, dashed }
  }

  const tip = (i: number, vw: number) => {
    const frac = xAt(i) / vw
    return { left: `${(frac * 100).toFixed(2)}%`, transform: frac > 0.62 ? 'translateX(calc(-100% - 14px))' : 'translateX(14px)' }
  }

  return (
    <div>
      {/* ── Filters (one row, scope everything below) ── */}
      <div className="flex flex-wrap items-center gap-3 mb-3 print:hidden">
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--charcoal)' }}>
          <span style={{ color: 'var(--mid-gray)' }}>From</span>
          <select value={fromM} onChange={e => setFromM(+e.target.value)} className="h-9 px-2 rounded-lg text-[13px] font-semibold" style={selStyle} aria-label="From month">
            {MONTHS_S.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={fromY} onChange={e => setFromY(+e.target.value)} className="h-9 px-2 rounded-lg text-[13px] font-semibold" style={selStyle} aria-label="From year">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span style={{ color: 'var(--mid-gray)' }}>to</span>
          <select value={toM} onChange={e => setToM(+e.target.value)} className="h-9 px-2 rounded-lg text-[13px] font-semibold" style={selStyle} aria-label="To month">
            {MONTHS_S.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={toY} onChange={e => setToY(+e.target.value)} className="h-9 px-2 rounded-lg text-[13px] font-semibold" style={selStyle} aria-label="To year">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-3 px-3 h-9 rounded-lg" style={{ border: '1px solid var(--light-gray)', background: 'white' }}>
          {GRAPH_BRANCHES.map(b => (
            <label key={b.value} className="flex items-center gap-1.5 text-sm cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}>
              <input type="checkbox" checked={ticked.includes(b.value)} onChange={() => toggleBranch(b.value)} />
              {b.label}
            </label>
          ))}
        </div>

        <button onClick={() => setShowTable(s => !s)} aria-pressed={showTable}
          className="flex items-center gap-2 px-3 h-9 rounded-lg text-sm font-medium"
          style={{ border: `1px solid ${showTable ? 'var(--teal)' : 'var(--light-gray)'}`, color: showTable ? 'var(--teal)' : 'var(--charcoal)', background: 'white' }}>
          <Table2 size={15} /> Table
        </button>

        {loadingN > 0 && <Loader2 className="animate-spin" size={18} style={{ color: 'var(--teal)' }} />}
      </div>

      <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
        {allTicked
          ? 'All branches: the combined books, including company-wide entries not tagged to a single branch.'
          : 'Sum of the ticked branch views. Company-wide entries (branch "ALL") appear only when every branch is ticked.'}
        {hasPartial && ` ${MONTHS_S[curMonth - 1]} ${curYear} is still in progress, so its figures are month to date.`}
      </p>

      {ticked.length === 0 && (
        <div className="rounded-lg py-16 text-center text-sm" style={{ ...card, color: 'var(--mid-gray)' }}>Tick at least one branch.</div>
      )}
      {error && ticked.length > 0 && (
        <div className="rounded-lg py-16 text-center text-sm" style={{ ...card, color: '#b91c1c' }}>{error}</div>
      )}

      {/* ── Summary tiles for the range ── */}
      {!error && ticked.length > 0 && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6 mb-4">
          {[
            { key: 'grossSales' as MetricKey, sub: `${points.length} month${points.length === 1 ? '' : 's'}${hasPartial ? ', last to date' : ''}` },
            { key: 'netSales' as MetricKey, sub: 'after discounts' },
            { key: 'grossProfit' as MetricKey, sub: `${pct(totals.grossProfit, totals.netSales)} of net sales` },
            { key: 'ebitda' as MetricKey, sub: `${pct(totals.ebitda, totals.netSales)} of net sales` },
            { key: 'netIncome' as MetricKey, sub: `${pct(totals.netIncome, totals.netSales)} net margin` },
            { key: 'marketing' as MetricKey, sub: `${pct(totals.marketing, totals.grossSales)} of gross sales` },
          ].map(t => (
            <StatCard key={t.key} label={METRICS.find(m => m.key === t.key)!.label} value={fmtPeso(totals[t.key])} sub={t.sub}
              accent={{ line: SERIES_COLOR[t.key], fg: totals[t.key] < 0 ? '#b91c1c' : undefined }} loading={!ready} compact />
          ))}
        </div>
      )}

      {/* ── Sales and profit ── */}
      {!error && ticked.length > 0 && (
        <div className="rounded-xl p-4 sm:p-5 mb-4" style={card}>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp size={16} style={{ color: 'var(--teal)' }} />
                <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Sales and profit by month</h3>
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>Click a name to hide or show its line. Hover the chart for exact amounts.</p>
            </div>
            {/* Legend: identity + toggle; colours never move between metrics */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lines shown">
              {LINE_METRICS.map(mt => {
                const off = hidden.includes(mt.key as LineKey)
                return (
                  <button key={mt.key} onClick={() => toggleMetric(mt.key as LineKey)} aria-pressed={!off}
                    className="flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium select-none border transition-colors"
                    style={{ borderColor: off ? 'var(--light-gray)' : '#d9dfd3', background: off ? 'white' : '#f6f8f2', color: off ? '#a3a29e' : 'var(--charcoal)' }}>
                    <span style={{ width: 14, height: 2.5, borderRadius: 2, background: off ? '#d6d5d0' : SERIES_COLOR[mt.key], display: 'inline-block' }} />
                    {mt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {!ready && (
            <div className="py-20 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
              <Loader2 className="animate-spin inline mr-2" size={16} />Loading ledger data…
            </div>
          )}

          {ready && chart && (
            <div className="relative" style={{ overflowX: 'auto' }}>
              <div className="relative" style={{ minWidth: 640 }}>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img"
                  aria-label={`Sales and profit by month, ${points[0].label} to ${points[points.length - 1].label}`}
                  onMouseLeave={() => setHover(null)}
                  onMouseMove={e => {
                    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
                    const px = ((e.clientX - rect.left) / rect.width) * W
                    let best = 0, bd = Infinity
                    points.forEach((_, i) => { const d = Math.abs(xAt(i) - px); if (d < bd) { bd = d; best = i } })
                    setHover(px >= PAD_L - 20 && px <= W - PAD_R + 20 ? best : null)
                  }}>
                  {/* grid + y labels (hairline, solid, recessive) */}
                  {chart.grid.map(g => (
                    <g key={g}>
                      <line x1={PAD_L} x2={W - PAD_R} y1={chart.yOf(g)} y2={chart.yOf(g)} stroke={g === 0 ? ZERO : GRID} strokeWidth={1} />
                      <text x={PAD_L - 10} y={chart.yOf(g) + 4} textAnchor="end" fontSize={11.5} fill={AXIS_TXT}>{fmtPeso(g)}</text>
                    </g>
                  ))}
                  {/* x labels */}
                  {points.map((p, i) => xLabel(i) && (
                    <text key={`${p.y}-${p.m}`} x={xAt(i)} y={H - PAD_B + 20} textAnchor="middle" fontSize={11.5} fill={AXIS_TXT}>
                      {p.label}
                      {p.partial && <tspan x={xAt(i)} dy={13} fontSize={10}>to date</tspan>}
                    </text>
                  ))}
                  {/* Gross Sales wash: the headline series, ~10% fill to zero */}
                  {!hidden.includes('grossSales') && (() => {
                    const n = points.length
                    const top = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${chart.yOf(p.values!.grossSales).toFixed(1)}`).join(' ')
                    const base = chart.yOf(Math.max(0, chart.grid[0]))
                    return <path d={`${top} L${xAt(n - 1).toFixed(1)},${base} L${xAt(0).toFixed(1)},${base} Z`} fill={SERIES_COLOR.grossSales} opacity={0.08} />
                  })()}
                  {/* crosshair (snaps to the month) */}
                  {hover !== null && (
                    <line x1={xAt(hover)} x2={xAt(hover)} y1={PAD_T} y2={H - PAD_B} stroke="#b9b8b3" strokeWidth={1} />
                  )}
                  {/* lines, 2px; the in-progress month dashed */}
                  {activeLines.map(mt => {
                    const { solid, dashed } = linePaths(mt.key as LineKey)
                    return (
                      <g key={mt.key}>
                        <path d={solid} fill="none" stroke={SERIES_COLOR[mt.key]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                        {dashed && <path d={dashed} fill="none" stroke={SERIES_COLOR[mt.key]} strokeWidth={2} strokeDasharray="4 5" strokeLinecap="round" opacity={0.75} />}
                      </g>
                    )
                  })}
                  {/* hover dots, with a 2px surface ring */}
                  {hover !== null && activeLines.map(mt => (
                    <circle key={mt.key} cx={xAt(hover)} cy={chart.yOf(points[hover].values![mt.key])} r={4.5}
                      fill={SERIES_COLOR[mt.key]} stroke="white" strokeWidth={2} />
                  ))}
                </svg>

                {/* floating tooltip: every series at this month, values lead */}
                {hover !== null && (
                  <div className="absolute pointer-events-none rounded-lg px-3 py-2.5 text-xs shadow-[0_6px_18px_rgba(0,0,0,0.10)]"
                    style={{ top: 8, ...tip(hover, W), background: 'white', border: '1px solid var(--light-gray)', minWidth: 200, zIndex: 5 }}>
                    <p className="font-semibold mb-1.5" style={{ color: 'var(--charcoal)' }}>
                      {MONTHS_S[points[hover].m - 1]} {points[hover].y}
                      {points[hover].partial && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>to date</span>}
                    </p>
                    {activeLines.map(mt => (
                      <div key={mt.key} className="flex items-center justify-between gap-4 py-0.5">
                        <span className="flex items-center gap-1.5" style={{ color: 'var(--mid-gray)' }}>
                          <span style={{ width: 10, height: 2.5, borderRadius: 2, background: SERIES_COLOR[mt.key], display: 'inline-block' }} />
                          {mt.label}
                        </span>
                        <span className="font-semibold tabular-nums" style={{ color: points[hover].values![mt.key] < 0 ? '#b91c1c' : 'var(--charcoal)' }}>
                          {fmtFull(points[hover].values![mt.key])}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Marketing & Ads (own scale, single series: no legend) ── */}
      {!error && ticked.length > 0 && ready && bars && (
        <div className="rounded-xl p-4 sm:p-5" style={card}>
          <div className="flex items-center gap-2">
            <Megaphone size={16} style={{ color: 'var(--teal)' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Marketing &amp; Ads spend by month (8120)</h3>
          </div>
          <p className="text-xs mt-0.5 mb-3" style={{ color: 'var(--mid-gray)' }}>Its own scale, so the spend is readable next to sales. Hover a bar for its share of gross sales.</p>
          <div className="relative" style={{ overflowX: 'auto' }}>
            <div className="relative" style={{ minWidth: 640 }}>
              <svg viewBox={`0 0 ${W} ${BH}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Marketing and ads spend by month"
                onMouseLeave={() => setBarHover(null)}>
                {bars.grid.map(g => (
                  <g key={g}>
                    <line x1={PAD_L} x2={W - PAD_R} y1={bars.yOf(g)} y2={bars.yOf(g)} stroke={g === 0 ? ZERO : GRID} strokeWidth={1} />
                    <text x={PAD_L - 10} y={bars.yOf(g) + 4} textAnchor="end" fontSize={11.5} fill={AXIS_TXT}>{fmtPeso(g)}</text>
                  </g>
                ))}
                {points.map((p, i) => {
                  const v = p.values!.marketing
                  const y0 = bars.yOf(0), y1 = bars.yOf(v)
                  const x = bars.cx(i) - bars.bw / 2
                  const h = Math.abs(y0 - y1)
                  const r = Math.min(4, h)
                  // 4px rounded data-end, square at the baseline
                  const d = v >= 0
                    ? `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bars.bw - r} Q${x + bars.bw},${y1} ${x + bars.bw},${y1 + r} V${y0} Z`
                    : `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + bars.bw - r} Q${x + bars.bw},${y1} ${x + bars.bw},${y1 - r} V${y0} Z`
                  return (
                    <g key={`${p.y}-${p.m}`} onMouseEnter={() => setBarHover(i)}>
                      <rect x={bars.cx(i) - bars.slot / 2} y={BPAD_T} width={bars.slot} height={BH - BPAD_T - BPAD_B} fill="transparent" />
                      {h > 0.5 && <path d={d} fill={SERIES_COLOR.marketing} opacity={p.partial ? 0.4 : barHover === null || barHover === i ? 1 : 0.55} />}
                      {xLabel(i) && (
                        <text x={bars.cx(i)} y={BH - BPAD_B + 20} textAnchor="middle" fontSize={11.5} fill={AXIS_TXT}>
                          {p.label}
                          {p.partial && <tspan x={bars.cx(i)} dy={13} fontSize={10}>to date</tspan>}
                        </text>
                      )}
                    </g>
                  )
                })}
              </svg>
              {barHover !== null && (
                <div className="absolute pointer-events-none rounded-lg px-3 py-2 text-xs shadow-[0_6px_18px_rgba(0,0,0,0.10)]"
                  style={{ top: 6, left: `${((bars.cx(barHover) / W) * 100).toFixed(2)}%`, transform: bars.cx(barHover) / W > 0.62 ? 'translateX(calc(-100% - 16px))' : 'translateX(16px)', background: 'white', border: '1px solid var(--light-gray)', minWidth: 180, zIndex: 5 }}>
                  <p className="font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>
                    {MONTHS_S[points[barHover].m - 1]} {points[barHover].y}
                    {points[barHover].partial && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>to date</span>}
                  </p>
                  <p className="text-[15px] font-semibold" style={{ color: 'var(--charcoal)' }}>{fmtFull(points[barHover].values!.marketing)}</p>
                  <p style={{ color: 'var(--mid-gray)' }}>{pct(points[barHover].values!.marketing, points[barHover].values!.grossSales)} of gross sales ({fmtPeso(points[barHover].values!.grossSales)})</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── accessible table view ── */}
      {showTable && ready && (
        <div className="mt-4 rounded-xl overflow-x-auto" style={card}>
          <table className="text-xs w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--hr-head)', borderBottom: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
                <th className="text-left py-2.5 px-3 text-[11px] font-bold uppercase tracking-[.4px]">Month</th>
                {METRICS.map(mt => <th key={mt.key} className="text-right py-2.5 px-3 text-[11px] font-bold uppercase tracking-[.4px]">{mt.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {points.map(p => (
                <tr key={`${p.y}-${p.m}`} style={{ borderBottom: '1px solid #f1f1f0' }}>
                  <td className="py-1.5 px-3" style={{ color: '#374151' }}>{p.label}{p.partial ? ' (to date)' : ''}</td>
                  {METRICS.map(mt => (
                    <td key={mt.key} className="text-right py-1.5 px-3 tabular-nums" style={{ color: p.values && p.values[mt.key] < 0 ? '#b91c1c' : '#111827' }}>
                      {p.values ? fmtFull(p.values[mt.key]) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
              <tr style={{ background: 'var(--hr-head)', fontWeight: 700 }}>
                <td className="py-2 px-3" style={{ color: 'var(--charcoal)' }}>Total</td>
                {METRICS.map(mt => (
                  <td key={mt.key} className="text-right py-2 px-3 tabular-nums" style={{ color: totals[mt.key] < 0 ? '#b91c1c' : 'var(--charcoal)' }}>{fmtFull(totals[mt.key])}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
