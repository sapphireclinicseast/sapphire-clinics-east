'use client'

// Reports → Sales by Payment → Monthly: stacked columns, one per month, split
// into Cash / GL / HMO (and Not from POS when there is any). Amount shows the
// volume and the mix together; Share % shows the mix alone (100% stacked).
// Marks per the dataviz spec: ≤24px columns, 2px surface gap between segments,
// 4px rounded top, hairline grid, legend always, hover/focus tooltip per month.
// The table under the chart carries every value (the Cash hue is below 3:1 on
// white, so values never rely on the chart alone).
import { useMemo, useState } from 'react'

type Key = 'cash' | 'gl' | 'hmo' | 'other'
export interface MixMonth { month: number; label: string; cash: number; gl: number; hmo: number; other: number; total: number }
interface Series { key: Key; label: string; fill: string }

const W = 760, H = 240, PAD_L = 52, PAD_R = 12, PAD_T = 14, PAD_B = 26
const GAP = 2 // surface gap between stacked segments

const compact = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '')}K`
  return `${Math.round(v)}`
}
const peso = (v: number) => `₱${Math.round(v).toLocaleString('en-PH')}`
/** A clean axis maximum and step (1, 2, 2.5 or 5 × 10ⁿ). */
function niceAxis(max: number, ticks = 4) {
  if (max <= 0) return { top: 1, step: 0.25 }
  const raw = max / ticks
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => s >= raw) || 10 * pow
  return { top: Math.ceil(max / step) * step, step }
}
/** A column segment: square corners, or a 4px-rounded top when it caps the stack. */
function segPath(x: number, y: number, w: number, h: number, roundTop: boolean) {
  if (h <= 0) return ''
  const r = roundTop ? Math.min(4, h, w / 2) : 0
  return `M${x},${y + h}V${y + r}${r ? `Q${x},${y} ${x + r},${y}` : ''}H${x + w - r}${r ? `Q${x + w},${y} ${x + w},${y + r}` : ''}V${y + h}Z`
}

export default function PaymentMixChart({ months, series, title }: { months: MixMonth[]; series: Series[]; title: string }) {
  const [mode, setMode] = useState<'amount' | 'share'>('amount')
  const [hover, setHover] = useState<number | null>(null)

  // Only positive parts stack; a negative "Not from POS" (a journal that reduced
  // the line) stays in the tooltip and the table.
  const stacks = useMemo(() => months.map(m => {
    const parts = series.map(s => ({ s, v: Math.max(0, m[s.key]) }))
    const pos = parts.reduce((t, p) => t + p.v, 0)
    return { m, parts, pos }
  }), [months, series])
  const maxPos = Math.max(0, ...stacks.map(s => s.pos))
  const axis = mode === 'share' ? { top: 1, step: 0.25 } : niceAxis(maxPos)
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B
  const band = plotW / Math.max(1, months.length)
  const barW = Math.min(24, band * 0.6)
  const yOf = (v: number) => PAD_T + plotH - (v / axis.top) * plotH
  const ticks: number[] = []
  for (let t = 0; t <= axis.top + 1e-9; t += axis.step) ticks.push(t)

  const hovered = hover != null ? stacks[hover] : null
  const hasData = maxPos > 0

  return (
    <div className="rounded-lg bg-white px-3 pt-3 pb-2" style={{ border: '1px solid var(--light-gray)' }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1 px-1">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{title} — by month</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1" aria-label="Legend">
            {series.map(s => (
              <span key={s.key} className="flex items-center text-xs" style={{ color: 'var(--charcoal)' }}>
                <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: s.fill }} />{s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
          {([['amount', 'Amount'], ['share', 'Share %']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className="px-2.5 py-1 text-xs font-medium"
              style={mode === k ? { background: 'var(--teal)', color: 'white' } : { background: 'white', color: 'var(--charcoal)' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <p className="py-10 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>No sales in these months.</p>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: 'block' }}
            aria-label={`${title}: monthly gross sales split by Cash, GL and HMO`}
            onMouseLeave={() => setHover(null)}>
            {/* Recessive hairline grid + y ticks */}
            {ticks.map(t => (
              <g key={t}>
                <line x1={PAD_L} x2={W - PAD_R} y1={yOf(t)} y2={yOf(t)} stroke="#e8ebee" strokeWidth={1} shapeRendering="crispEdges" />
                <text x={PAD_L - 8} y={yOf(t) + 3.5} textAnchor="end" fontSize={10} fill="#8a94a3">
                  {mode === 'share' ? `${Math.round(t * 100)}%` : compact(t)}
                </text>
              </g>
            ))}
            {stacks.map((st, i) => {
              const x = PAD_L + band * i + (band - barW) / 2
              const denom = mode === 'share' ? st.pos : 1
              let base = 0
              const drawn = st.parts.filter(p => p.v > 0)
              const dim = hover != null && hover !== i
              return (
                <g key={st.m.month} opacity={dim ? 0.45 : 1}>
                  {denom > 0 && drawn.map((p, j) => {
                    const v = p.v / denom
                    const yTop = yOf(base + v), yBot = yOf(base)
                    base += v
                    const isTop = j === drawn.length - 1
                    // The surface gap sits on top of each segment that has another above it.
                    const h = Math.max(0, yBot - yTop - (isTop ? 0 : GAP))
                    return <path key={p.s.key} d={segPath(x, isTop ? yTop : yTop + GAP, barW, h, isTop)} fill={p.s.fill} />
                  })}
                  <text x={PAD_L + band * i + band / 2} y={H - 8} textAnchor="middle" fontSize={10.5} fill="#6b7280">{st.m.label}</text>
                  {/* Hit target: the whole month band, keyboard-focusable. */}
                  <rect x={PAD_L + band * i} y={PAD_T} width={band} height={plotH} fill="transparent"
                    tabIndex={0} role="button" aria-label={`${st.m.label}: ${peso(st.m.total)}`}
                    onMouseEnter={() => setHover(i)} onMouseMove={() => setHover(i)}
                    onFocus={() => setHover(i)} onBlur={() => setHover(null)} style={{ outline: 'none', cursor: 'default' }} />
                </g>
              )
            })}
            <line x1={PAD_L} x2={W - PAD_R} y1={yOf(0)} y2={yOf(0)} stroke="#cbd2d9" strokeWidth={1} shapeRendering="crispEdges" />
          </svg>

          {hovered && (
            <div className="absolute z-10 pointer-events-none rounded-lg px-3 py-2 text-xs shadow-lg bg-white"
              style={{
                border: '1px solid var(--light-gray)', top: 8, minWidth: 170,
                // Beside the hovered column, never over it: right of it in the left
                // half of the chart, left of it in the right half.
                ...(() => {
                  const c = ((PAD_L + band * hover! + band / 2) / W) * 100
                  const off = ((barW / 2 + 10) / W) * 100
                  return c < 55 ? { left: `${c + off}%` } : { right: `${100 - c + off}%` }
                })(),
              }}>
              <p className="font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>{months[hover!] ? `${months[hover!].label}` : ''} · {peso(hovered.m.total)}</p>
              {series.map(s => {
                const v = hovered.m[s.key]
                if (Math.abs(v) < 0.5) return null
                return (
                  <div key={s.key} className="flex items-center gap-2 tabular-nums">
                    <span aria-hidden className="inline-block w-3 h-0.5 rounded" style={{ background: s.fill }} />
                    <span className="font-semibold" style={{ color: '#111827' }}>{peso(v)}</span>
                    <span style={{ color: 'var(--mid-gray)' }}>
                      {s.label}{hovered.m.total ? ` · ${((v / hovered.m.total) * 100).toFixed(1)}%` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
