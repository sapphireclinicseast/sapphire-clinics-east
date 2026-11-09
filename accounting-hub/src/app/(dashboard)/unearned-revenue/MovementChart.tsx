'use client'

// Month-by-month chart for the Unearned Revenue page: received (credits) and
// released (debits) as paired bars, the month-end balance as a line. Drawn at the
// card's real pixel width (no viewBox scaling), so the labels stay readable on a
// phone and the chart never needs sideways scrolling. Hover or tap a month for its
// figures; click to filter the line list to that month.
import { useEffect, useMemo, useRef, useState } from 'react'
import { type MonthRow, MONTHS, monthLabel, peso, pesoCompact, pesoSigned } from './movement'

export const RECEIVED_COLOR = '#4A8073' // --bright-teal
export const RELEASED_COLOR = '#D9A35B' // soft amber (HR Hub look)
export const BALANCE_COLOR = '#233038'  // HR Hub ink

function niceStep(span: number): number {
  const raw = span / 4
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  return [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => s >= raw) || raw
}

export default function MovementChart({ rows, selected, onSelect }: {
  rows: MonthRow[]
  selected: string
  onSelect: (key: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = Math.round(entries[0]?.contentRect.width || 0)
      if (w > 0) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const narrow = width < 480
  const H = narrow ? 220 : 260
  const L = narrow ? 44 : 56, R = 8, T = 10, B = 36
  const innerW = Math.max(40, width - L - R)
  const innerH = H - T - B
  const n = rows.length

  const geo = useMemo(() => {
    let hi = 0, lo = 0
    for (const r of rows) {
      hi = Math.max(hi, r.cr, r.dr, r.balance)
      lo = Math.min(lo, r.balance)
    }
    if (hi === lo) hi = lo + 1
    const step = niceStep(hi - lo)
    const top = Math.ceil(hi / step) * step
    const bottom = Math.floor(lo / step) * step
    const grid: number[] = []
    for (let g = bottom; g <= top + step / 2; g += step) grid.push(g)
    const y = (v: number) => T + ((top - v) / (top - bottom)) * innerH
    return { y, grid }
  }, [rows, innerH])

  const slot = innerW / Math.max(1, n)
  const cx = (i: number) => L + slot * i + slot / 2
  const barW = Math.max(1.5, Math.min(14, slot * 0.34))
  const zeroY = geo.y(0)

  // Month labels: as many as fit (~38px each), always on a January so years read at a glance.
  const fit = Math.max(1, Math.floor(innerW / 38))
  const every = [1, 2, 3, 4, 6, 12].find(k => Math.ceil(n / k) <= fit) || 12
  const showMonth = (i: number) => (parseInt(rows[i].key.slice(5, 7), 10) - 1) % every === 0
  const yearStarts = rows.map((r, i) => (i === 0 || r.key.slice(5, 7) === '01' ? i : -1)).filter(i => i >= 0)

  const balancePath = rows.map((r, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${geo.y(r.balance).toFixed(1)}`).join(' ')

  const pick = (clientX: number, el: SVGSVGElement) => {
    const x = clientX - el.getBoundingClientRect().left
    const i = Math.floor((x - L) / slot)
    return i >= 0 && i < n ? i : null
  }

  const tip = hover != null ? rows[hover] : null
  const tipLeft = hover != null ? Math.min(Math.max(cx(hover) - 90, 0), Math.max(0, width - 180)) : 0

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <svg width={width} height={H} role="img" style={{ display: 'block', cursor: 'pointer' }}
        aria-label={`Unearned revenue by month, ${n} month${n === 1 ? '' : 's'}: received, released and month-end balance`}
        onMouseMove={e => setHover(pick(e.clientX, e.currentTarget))}
        onMouseLeave={() => setHover(null)}
        onClick={e => { const i = pick(e.clientX, e.currentTarget); if (i != null) { setHover(i); onSelect(rows[i].key) } }}>
        {/* gridlines + y labels */}
        {geo.grid.map(g => (
          <g key={g}>
            <line x1={L} x2={width - R} y1={geo.y(g)} y2={geo.y(g)} stroke={g === 0 ? '#C9D6B4' : '#E9EFDC'} strokeWidth={1} />
            <text x={L - 6} y={geo.y(g) + 3.5} textAnchor="end" fontSize={10} fill="#8A9AA0">{pesoCompact(g)}</text>
          </g>
        ))}

        {/* selected / hovered month band */}
        {rows.map((r, i) => (r.key === selected || i === hover) ? (
          <rect key={`band-${r.key}`} x={L + slot * i} y={T} width={slot} height={innerH}
            fill={r.key === selected ? '#EDF3D9' : '#f4f7ec'} />
        ) : null)}

        {/* year dividers */}
        {yearStarts.filter(i => i > 0).map(i => (
          <line key={`yr-${i}`} x1={L + slot * i} x2={L + slot * i} y1={T} y2={H - B + 4} stroke="#DDE6CC" strokeDasharray="3 3" />
        ))}

        {/* bars: received then released, side by side */}
        {rows.map((r, i) => {
          const x = cx(i)
          const yc = geo.y(r.cr), yd = geo.y(r.dr)
          return (
            <g key={r.key}>
              <rect x={x - barW - 0.5} y={Math.min(yc, zeroY)} width={barW} height={Math.max(r.cr ? 1 : 0, Math.abs(zeroY - yc))} rx={1.5} fill={RECEIVED_COLOR} />
              <rect x={x + 0.5} y={Math.min(yd, zeroY)} width={barW} height={Math.max(r.dr ? 1 : 0, Math.abs(zeroY - yd))} rx={1.5} fill={RELEASED_COLOR} />
            </g>
          )
        })}

        {/* month-end balance */}
        {n > 1 && <path d={balancePath} fill="none" stroke={BALANCE_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {rows.map((r, i) => (n <= 18 || i === hover || r.key === selected || i === n - 1) ? (
          <circle key={`b-${r.key}`} cx={cx(i)} cy={geo.y(r.balance)} r={i === hover ? 4 : 2.5} fill="#fff" stroke={BALANCE_COLOR} strokeWidth={2} />
        ) : null)}

        {/* x axis: months, then the year under its first month */}
        {rows.map((r, i) => showMonth(i) ? (
          <text key={`m-${r.key}`} x={cx(i)} y={H - B + 14} textAnchor="middle" fontSize={10}
            fill={r.key === selected ? '#3C6A5F' : '#8A9AA0'} fontWeight={r.key === selected ? 700 : 400}>
            {MONTHS[parseInt(r.key.slice(5, 7), 10) - 1]}
          </text>
        ) : null)}
        {yearStarts.map(i => (
          <text key={`y-${i}`} x={Math.max(L, L + slot * i + 2)} y={H - B + 29} fontSize={10.5} fontWeight={700} fill="#233038">
            {rows[i].key.slice(0, 4)}
          </text>
        ))}
      </svg>

      {tip && (
        <div className="absolute z-10 pointer-events-none rounded-lg border px-3 py-2 text-xs shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
          style={{ left: tipLeft, top: 4, width: 180, background: 'white', borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
          <p className="font-semibold mb-1">{monthLabel(tip.key)}</p>
          <p className="flex justify-between gap-2"><span style={{ color: 'var(--mid-gray)' }}><Swatch c={RECEIVED_COLOR} />Received</span><span className="tabular-nums">{peso(tip.cr)}</span></p>
          <p className="flex justify-between gap-2"><span style={{ color: 'var(--mid-gray)' }}><Swatch c={RELEASED_COLOR} />Released</span><span className="tabular-nums">{peso(tip.dr)}</span></p>
          <p className="flex justify-between gap-2 font-semibold"><span>Net</span><span className="tabular-nums">{peso(tip.net)}</span></p>
          <p className="flex justify-between gap-2 mt-1 pt-1 border-t" style={{ borderColor: 'var(--light-gray)' }}>
            <span style={{ color: 'var(--mid-gray)' }}><Swatch c={BALANCE_COLOR} line />Balance</span><span className="tabular-nums">{pesoSigned(tip.balance)}</span>
          </p>
        </div>
      )}
    </div>
  )
}

export function Swatch({ c, line }: { c: string; line?: boolean }) {
  return <span className="inline-block mr-1.5 align-middle rounded-sm" style={{ width: line ? 12 : 9, height: line ? 3 : 9, background: c }} />
}
