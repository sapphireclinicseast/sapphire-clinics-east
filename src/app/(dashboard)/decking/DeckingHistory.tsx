'use client'

// The decking board over time: two panels, filled above open, sharing one date
// axis.
//
// Two panels rather than one stacked chart because the series move at wildly
// different sizes. Over a fortnight at Greenhills, filled ran 162–166 — a range
// of FOUR slots — while open ran 229–345. Stacked to a zero baseline, a day when
// two children were booked moved the line by 0.4% of the height: invisible. One
// shared axis cannot fix that, since whatever scale makes open legible flattens
// filled. Separate scales is the only honest way to show both.
//
// Each panel's y-axis is fitted to its own data and does NOT start at zero, so
// small day-to-day moves are readable. That is why these are LINES, not filled
// areas: area implies magnitude measured from zero, and filling down to a
// truncated baseline would exaggerate every wiggle into a cliff. A line carries
// no such claim, so it is free to be zoomed. The axis labels always show the
// real numbers, and the tiles above carry the absolute figures.
//
// Blocked hours are deliberately not drawn. They used to be stacked in, so the
// top edge met "Slots offered" exactly; but they were over half the height on
// some days and buried the two numbers the desk acts on. They are not capacity
// either: the tiles count bookable slots as filled + open, and report the
// unavailable hours beside that as their own number rather than inside it.
//
// Green/gold rather than green/yellow-green: green against yellow is the
// red-green confusion, and a bright yellow cannot hold 3:1 against white. This
// pair separates by ΔE 16.3 under protanopia and clears contrast — checked with
// the palette validator, not by eye.

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { ArrowDownRight, ArrowUpRight, Gauge, Loader2, Minus } from 'lucide-react'
import { CARD_STYLE, DashCard, KpiCard, Skeleton, EmptyState } from '../patients/dashboard/ui'
import { CONTROL, CONTROL_STYLE, ErrorCard, LABEL, PillTabs } from './ui'

const DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS']
const DEPT_TABS = [
  { id: 'all', label: 'All' },
  ...DEPARTMENTS.map(d => ({ id: d, label: d === 'PSYCHOLOGY' ? 'Psychology' : d === 'ORTHOSIS' ? 'Orthosis' : d })),
]

// The validated pair. Filled is the green, open the dark gold — the line tone,
// not the pale fill the old stacked area used, since a 2px line needs the
// contrast.
const FILLED = '#166534'
const OPEN = '#B8860B'
// Recessive chart furniture, same tokens as the Scheduling Dashboard.
const GRID_STROKE = '#EEF2F1'
const AXIS_TICK = { fontSize: 10, fill: '#7a9e94' }

interface Point {
  date: string
  label: string
  totalSlots: number
  booked: number
  blocked: number
  open: number
  fillRate: number | null
}

/**
 * A y-range fitted to one series, padded so the line does not graze the frame.
 *
 * Never starts at zero — that is the whole point of splitting the panels. A flat
 * series still gets a band around it rather than a zero-height axis, so a week of
 * no movement reads as a straight line across the middle instead of a jagged one
 * across a degenerate scale.
 */
function fittedDomain(values: number[]): [number, number] {
  const vals = values.filter(Number.isFinite)
  if (vals.length === 0) return [0, 1]
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (min === max) return [Math.max(0, min - 2), max + 2]

  const pad = Math.max(1, Math.round((max - min) * 0.2))
  const lo = Math.max(0, min - pad)
  const hi = max + pad

  // Snapped to a round step so the axis reads 200/250/300 rather than
  // 206/251/296 — recharts divides whatever bounds it is given, and raw fitted
  // bounds give ticks nobody can hold in their head. Six bands is the most a
  // panel this short can label without crowding.
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
  const step = steps.find(s => (hi - lo) / s <= 6) ?? 1000
  return [Math.max(0, Math.floor(lo / step) * step), Math.ceil(hi / step) * step]
}

function isoDaysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

/** Bookable = what could be sold: filled + open. Unavailable hours are not in it. */
const bookableOf = (p: Point) => p.booked + p.open

export default function DeckingHistory({ branch }: { branch: string }) {
  const [dept, setDept] = useState('all')
  const [from, setFrom] = useState(isoDaysAgo(90))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [points, setPoints] = useState<Point[]>([])
  const [firstRecorded, setFirstRecorded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Bumped by "Try again" to re-run the same request; not sent to the API.
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const ctl = new AbortController()
    setLoading(true); setError('')
    const p = new URLSearchParams({ branch, department: dept, from, to })
    fetch(`/api/decking/history?${p}`, { signal: ctl.signal })
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Could not load history')
        setPoints(d.points ?? [])
        setFirstRecorded(d.firstRecorded ?? null)
      })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => setLoading(false))
    return () => ctl.abort()
  }, [branch, dept, from, to, reload])

  const first = points[0]
  const latest = points[points.length - 1]
  const rangeBackwards = !!from && !!to && from > to

  return (
    <div className="space-y-4 min-w-0">
      {/* ── Toolbar ── */}
      <div className="rounded-xl px-4 py-3 flex flex-wrap items-end gap-x-5 gap-y-3" style={CARD_STYLE}>
        <div className="min-w-0 max-w-full">
          <span className={LABEL} style={{ color: 'var(--mid-gray)' }}>Department</span>
          <PillTabs label="Department" size="sm" tabs={DEPT_TABS} value={dept} onChange={setDept} />
        </div>
        <div>
          <label className={LABEL} style={{ color: 'var(--mid-gray)' }} htmlFor="dh-from">Date range</label>
          <div className="flex flex-wrap items-center gap-1.5">
            <input id="dh-from" type="date" value={from} onChange={e => setFrom(e.target.value)}
              aria-label="From" className={`${CONTROL} w-[9.5rem]`} style={CONTROL_STYLE} />
            <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              aria-label="To" className={`${CONTROL} w-[9.5rem]`} style={CONTROL_STYLE} />
          </div>
        </div>
        <span className="flex items-center gap-1.5 h-9 ml-auto text-[11px]" style={{ color: 'var(--mid-gray)' }} aria-live="polite">
          {loading && points.length > 0 && <><Loader2 size={12} className="animate-spin" /> Updating…</>}
        </span>
      </div>

      {error ? (
        <ErrorCard title="Couldn't load decking history" hint={error} onRetry={() => setReload(n => n + 1)} />
      ) : loading && points.length === 0 ? (
        <HistorySkeleton />
      ) : points.length === 0 ? (
        <section className="rounded-xl" style={CARD_STYLE}>
          {rangeBackwards ? (
            <EmptyState title="The start date is after the end date"
              hint="Pick a “from” date on or before the “to” date." />
          ) : (
            // Said plainly rather than drawn as a flat zero line. The board keeps
            // no dated record of its own, so there is genuinely nothing before the
            // first snapshot — pretending otherwise would be inventing a past.
            <EmptyState title="No history recorded yet for this range"
              hint="The board is a weekly template — it holds no dates, so there is nothing to reconstruct earlier days from. A reading is taken once a day from now on, and the chart fills in as those accumulate." />
          )}
        </section>
      ) : (
        <>
          {/* ── KPI row ── all from the latest reading, except the change tile. */}
          {latest && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              {/* Only the two plotted series wear a series colour; the other
                  tiles are ink, so a colour on this row always means "that line
                  in the chart". */}
              <KpiCard label="Filled" icon={<Swatch colour={FILLED} />}
                value={<span style={{ color: FILLED }}>{latest.booked.toLocaleString()}</span>}
                sub={`slots with a patient · ${latest.label}`} />
              <KpiCard label="Open" icon={<Swatch colour={OPEN} />}
                value={<span style={{ color: OPEN }}>{latest.open.toLocaleString()}</span>}
                sub={`bookable, not yet filled · ${latest.label}`} />
              <KpiCard label="Fill rate" icon={<Gauge size={15} />}
                value={latest.fillRate === null ? '—' : `${latest.fillRate}%`}
                sub={bookableOf(latest) > 0
                  ? `${latest.booked} of ${bookableOf(latest)} bookable slots`
                  : 'no bookable slots'} />
              <ChangeTile first={first} latest={latest} />
              {/* Was "Slots offered" = totalSlots, which counts unavailable
                  hours. Those are not capacity, so the tile now shows what can
                  actually be sold and names the unavailable hours separately. */}
              <KpiCard label="Bookable slots"
                value={bookableOf(latest).toLocaleString()}
                sub={latest.blocked > 0
                  ? `filled + open · ${latest.blocked} unavailable not counted`
                  : 'filled + open · none marked unavailable'} />
            </div>
          )}

          {/* ── The two panels ── one series each, each on its own fitted
              scale. syncId ties the crosshairs together, so hovering a date
              reads both panels at once and the split costs nothing when
              comparing them. */}
          <SeriesPanel points={points} dataKey="booked" colour={FILLED}
            title="Filled slots" what="slots with a patient booked in" />
          <SeriesPanel points={points} dataKey="open" colour={OPEN}
            title="Open slots" what="bookable slots still empty — unavailable hours are not counted"
            footer={firstRecorded ? (
              <>History begins {new Date(`${firstRecorded}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} —
                the first day a reading was taken. Nothing before that was recorded.</>
            ) : undefined} />
        </>
      )}
    </div>
  )
}

function Swatch({ colour }: { colour: string }) {
  return <span aria-hidden className="block rounded-sm" style={{ width: 10, height: 10, background: colour }} />
}

/** Filled now against filled at the first reading in range. */
function ChangeTile({ first, latest }: { first: Point | undefined; latest: Point }) {
  if (!first || first.date === latest.date) {
    return <KpiCard label="Filled vs start" icon={<Minus size={15} />} value="—" sub="needs two readings" />
  }
  const delta = latest.booked - first.booked
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus
  // Direction is carried by the sign and the arrow, not colour alone.
  const tone = delta > 0 ? FILLED : delta < 0 ? '#991B1B' : 'var(--charcoal)'
  const rate = first.fillRate !== null && latest.fillRate !== null
    ? ` · fill ${first.fillRate}% → ${latest.fillRate}%`
    : ''
  return (
    <KpiCard label="Filled vs start" icon={<Icon size={15} />} accent={tone}
      value={<span className="inline-flex items-center gap-1" style={{ color: tone }}>
        <Icon size={20} aria-hidden />{delta > 0 ? '+' : delta < 0 ? '−' : '±'}{Math.abs(delta).toLocaleString()}
      </span>}
      sub={`since ${first.label}${rate}`} />
  )
}

function SeriesPanel({ points, dataKey, colour, title, what, footer }: {
  points: Point[]
  dataKey: 'booked' | 'open'
  colour: string
  title: string
  what: string
  footer?: ReactNode
}) {
  const domain = fittedDomain(points.map(p => p[dataKey]))
  const lastIndex = points.length - 1
  return (
    <DashCard
      title={title}
      icon={<Swatch colour={colour} />}
      description={<>Daily reading of {what}. Axis zoomed to {domain[0].toLocaleString()}–{domain[1].toLocaleString()} for this range, not from zero — read the numbers, not the height.</>}
      footer={footer}
    >
      {/* Animation off: recharts draws a Line by animating stroke-dasharray
          from a stub, and it stalled on the first frame elsewhere in this
          module — a line chart with no visible line. */}
      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={points} syncId="decking-history" margin={{ top: 10, right: 44, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          {/* minTickGap drops labels rather than overprinting them: a 90-day
              range is the default, and every date will not fit. */}
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }}
            height={22} minTickGap={16} interval="preserveStartEnd" />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} domain={domain} />
          <Tooltip content={p => <HistoryTooltip active={p.active} payload={p.payload} />}
            cursor={{ stroke: '#CBD5E1', strokeWidth: 1 }} />
          {/* Only the latest reading gets a dot, with its value printed beside
              it — a direct label, so the panel needs no legend. */}
          <Line type="monotone" dataKey={dataKey} name={title} stroke={colour} strokeWidth={2}
            dot={d => d.index === lastIndex && Number.isFinite(d.cx) && Number.isFinite(d.cy) ? (
              <g key={`end-${dataKey}`}>
                <circle cx={d.cx} cy={d.cy} r={4} fill={colour} stroke="#fff" strokeWidth={2} />
                <text x={(d.cx ?? 0) + 8} y={d.cy} dy="0.35em" fontSize={11} fontWeight={700} fill={colour}
                  style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {Number(d.value).toLocaleString()}
                </text>
              </g>
            ) : <g key={`dot-${dataKey}-${d.index}`} />}
            activeDot={{ r: 4.5, strokeWidth: 2, stroke: '#fff', fill: colour }}
            isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </DashCard>
  )
}

/** One card for both panels: the day, both series and the fill rate. */
function HistoryTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) {
  const p = payload?.[0]?.payload as Point | undefined
  if (!active || !p) return null
  const rows: { label: string; value: string; colour?: string }[] = [
    { label: 'Filled', value: p.booked.toLocaleString(), colour: FILLED },
    { label: 'Open', value: p.open.toLocaleString(), colour: OPEN },
    { label: 'Fill rate', value: p.fillRate === null ? '—' : `${p.fillRate}%` },
  ]
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ ...CARD_STYLE, boxShadow: '0 4px 14px rgba(0,0,0,0.08)', minWidth: 150 }}>
      <p className="font-semibold mb-1.5" style={{ color: 'var(--charcoal)' }}>
        {new Date(`${p.date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
      </p>
      {rows.map(r => (
        <div key={r.label} className="flex items-center justify-between gap-4 leading-relaxed">
          <span className="flex items-center gap-1.5" style={{ color: 'var(--mid-gray)' }}>
            {r.colour ? <span aria-hidden className="inline-block rounded-full" style={{ width: 8, height: 2.5, background: r.colour }} />
              : <span aria-hidden className="inline-block" style={{ width: 8 }} />}
            {r.label}
          </span>
          <span className="font-semibold" style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
        </div>
      ))}
      {p.blocked > 0 && (
        <p className="mt-1.5 pt-1.5 text-[11px]" style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
          {p.blocked.toLocaleString()} unavailable — not counted
        </p>
      )}
    </div>
  )
}

function HistorySkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl px-4 py-3.5" style={CARD_STYLE}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16 mt-2" />
            <Skeleton className="h-3 w-28 mt-2" />
          </div>
        ))}
      </div>
      {[0, 1].map(i => (
        <div key={i} className="rounded-xl" style={CARD_STYLE}>
          <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-2/3 mt-2" />
          </div>
          <div className="p-5"><Skeleton className="h-[190px]" /></div>
        </div>
      ))}
    </div>
  )
}
