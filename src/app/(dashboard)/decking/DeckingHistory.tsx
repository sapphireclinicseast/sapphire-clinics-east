'use client'

// The decking board over time: one stacked area — filled beneath open, both
// drawn up from zero, so the band heights are the day's composition and the
// top edge is every bookable slot on the board.
//
// Why stacked, and what it costs. A reader gets "how much could we sell" and
// "how much of it sold" from one shape instead of holding two charts in their
// head. The price is resolution: on an axis running to several hundred slots,
// a day when three or four more children were booked barely moves the seam.
// That trade is deliberate — composition is what this chart is read for — and
// the exact figures are in the tiles above it and in the tooltip for any day.
// (This replaced two separately-scaled line panels, which were zoomed to make
// those small moves visible.)
//
// From zero, never a cut axis: a stacked area read off a truncated baseline
// misstates the proportion, which is the one thing the shape is meant to show.
//
// Blocked (unavailable) hours are not drawn and are not capacity. They were
// over half the height on some days and buried the two numbers the desk acts
// on; and an hour a consultant never offered is not one that could be sold.
// So the top edge is filled + open, fill rate is filled ÷ (filled + open), and
// the tiles name the unavailable hours beside the bookable figure rather than
// inside it.
//
// Green/gold rather than green/yellow-green: green against yellow is the
// red-green confusion, and a bright yellow cannot hold 3:1 against white. This
// pair separates by ΔE 16.3 under protanopia and clears contrast — checked with
// the palette validator, not by eye.

import { useEffect, useState } from 'react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { ArrowDownRight, ArrowUpRight, Gauge, Layers, Loader2, Minus, Percent } from 'lucide-react'
import { CARD_STYLE, DashCard, KpiCard, Skeleton, EmptyState } from '../patients/dashboard/ui'
import { CONTROL, CONTROL_STYLE, ErrorCard, LABEL, PillTabs } from './ui'

const DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS']
const DEPT_TABS = [
  { id: 'all', label: 'All' },
  ...DEPARTMENTS.map(d => ({ id: d, label: d === 'PSYCHOLOGY' ? 'Psychology' : d === 'ORTHOSIS' ? 'Orthosis' : d })),
]

// The validated pair. Filled is the green band; open is the gold band, with the
// darker gold for its top edge and for open figures printed as text, where the
// band tone would not hold contrast on white.
const FILLED = '#166534'
const OPEN_FILL = '#E8B533'
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
            {/* Shortcuts for the ranges people actually pick; they only set
                the two dates below, which stay editable for anything else. */}
            {(() => {
              const today = new Date().toISOString().slice(0, 10)
              const presets = [
                { id: '30', label: '30 days', from: isoDaysAgo(30) },
                { id: '90', label: '90 days', from: isoDaysAgo(90) },
                ...(firstRecorded ? [{ id: 'all', label: 'Since start', from: firstRecorded }] : []),
              ]
              const current = to === today ? presets.find(pr => pr.from === from)?.id ?? 'custom' : 'custom'
              return (
                <PillTabs label="Date range shortcut" size="sm" value={current}
                  onChange={id => { const pr = presets.find(x => x.id === id); if (pr) { setFrom(pr.from); setTo(today) } }}
                  tabs={presets.map(pr => ({ id: pr.id, label: pr.label }))} />
              )
            })()}
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
                  tiles are ink, so a colour on this row always means "that band
                  in the chart". */}
              <KpiCard label="Filled" icon={<Swatch colour={FILLED} />}
                value={<span style={{ color: FILLED }}>{latest.booked.toLocaleString()}</span>}
                sub={`slots with a patient · ${latest.label}`} />
              <KpiCard label="Open" icon={<Swatch colour={OPEN_FILL} />}
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

          {/* First, because it is the one people came for: the charts show
              the shape, this says whether it went up or down and by how much. */}
          <WeeklyTable branch={branch} />
          <StackedChart points={points} firstRecorded={firstRecorded} />
          {points.some(pt => pt.fillRate !== null) && <FillRateChart points={points} />}
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

// Plot geometry, fixed so the direct labels can be placed against the bands.
// The y-axis starts at zero, so the baseline is the bottom of the plot area.
const CHART_H = 300
const CHART_MARGIN = { top: 10, right: 84, bottom: 0, left: -8 }
const X_AXIS_H = 22
const BASELINE_Y = CHART_H - CHART_MARGIN.bottom - X_AXIS_H

function StackedChart({ points, firstRecorded }: { points: Point[]; firstRecorded: string | null }) {
  const lastIndex = points.length - 1
  const latest = points[lastIndex]

  return (
    <DashCard
      title="Filled and open slots"
      icon={<Layers size={15} />}
      description="Stacked from zero — filled beneath open; the top edge is every bookable slot."
      action={
        <div className="flex items-center gap-3 text-[11px] font-semibold" style={{ color: 'var(--mid-gray)' }} aria-hidden>
          <span className="flex items-center gap-1.5"><Swatch colour={FILLED} /> Filled</span>
          <span className="flex items-center gap-1.5"><Swatch colour={OPEN_FILL} /> Open</span>
        </div>
      }
      footer={firstRecorded ? (
        <>History begins {new Date(`${firstRecorded}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} —
          the first day a reading was taken. Nothing before that was recorded.</>
      ) : undefined}
    >
      {/* Animation off: it stalled on the first frame elsewhere in this module
          and drew nothing at all. */}
      <ResponsiveContainer width="100%" height={CHART_H}>
        <AreaChart data={points} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          {/* minTickGap drops labels rather than overprinting them: a 90-day
              range is the default, and every date will not fit. */}
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }}
            height={X_AXIS_H} minTickGap={16} interval="preserveStartEnd" />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44}
            domain={[0, 'auto']} />
          <Tooltip content={p => <HistoryTooltip active={p.active} payload={p.payload} />}
            cursor={{ stroke: '#CBD5E1', strokeWidth: 1 }} />
          {/* Filled first so it sits beneath. Its white stroke is the seam
              between the two bands; the open band carries its own top edge.
              Only the last point gets a "dot": a direct label in the right
              margin, level with the middle of its band. */}
          <Area type="monotone" dataKey="booked" name="Filled" stackId="deck"
            fill={FILLED} fillOpacity={0.85} stroke="#fff" strokeWidth={2}
            dot={d => {
              if (d.index !== lastIndex || !Number.isFinite(d.cy) || !latest) return <g key={`f-${d.index}`} />
              return (
                <EndLabel key="end-filled" x={d.cx as number} y={(BASELINE_Y + (d.cy as number)) / 2}
                  name="Filled" value={latest.booked} colour={FILLED} />
              )
            }}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: FILLED }}
            isAnimationActive={false} />
          <Area type="monotone" dataKey="open" name="Open" stackId="deck"
            fill={OPEN_FILL} fillOpacity={0.75} stroke={OPEN} strokeWidth={1.5}
            dot={d => {
              if (d.index !== lastIndex || !Number.isFinite(d.cy) || !latest) return <g key={`o-${d.index}`} />
              // The axis is linear from zero, so the seam's height follows from
              // the stack's top and the filled share of it.
              const top = d.cy as number
              const stack = latest.booked + latest.open
              const bottom = stack > 0 ? BASELINE_Y - (BASELINE_Y - top) * (latest.booked / stack) : BASELINE_Y
              // Kept clear of the filled label when the open band is thin.
              const y = Math.max(8, Math.min((top + bottom) / 2, (BASELINE_Y + bottom) / 2 - 14))
              return (
                <EndLabel key="end-open" x={d.cx as number} y={y}
                  name="Open" value={latest.open} colour={OPEN} />
              )
            }}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: OPEN }}
            isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </DashCard>
  )
}

/**
 * Fill rate on its own axis (0–100%). The stacked chart above shows how many
 * slots; this shows the share, which the stack hides — a 14-point drop barely
 * moves the seam on an axis that runs to several hundred. Its own chart, never
 * a second axis on the first.
 */
function FillRateChart({ points }: { points: Point[] }) {
  const rated = points.filter(pt => pt.fillRate !== null)
  const avg = rated.length ? Math.round(rated.reduce((n, pt) => n + (pt.fillRate ?? 0), 0) / rated.length) : null
  const lastIndex = points.length - 1
  const latest = points[lastIndex]
  return (
    <DashCard
      title="Fill rate"
      icon={<Percent size={15} />}
      description={<>Filled ÷ bookable, each day. The dashed line is the average for this range{avg !== null ? <> ({avg}%)</> : null}.</>}
    >
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={points} margin={{ top: 10, right: 52, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }}
            height={X_AXIS_H} minTickGap={16} interval="preserveStartEnd" />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]} tickFormatter={v => `${v}%`} />
          {avg !== null && <ReferenceLine y={avg} stroke="#94A3B8" strokeDasharray="4 4" />}
          <Tooltip content={p => <HistoryTooltip active={p.active} payload={p.payload} />}
            cursor={{ stroke: '#CBD5E1', strokeWidth: 1 }} />
          <Line type="monotone" dataKey="fillRate" name="Fill rate" stroke="#1A7B8A" strokeWidth={2}
            connectNulls isAnimationActive={false}
            dot={d => {
              if (d.index !== lastIndex || !Number.isFinite(d.cy) || latest?.fillRate == null) return <g key={`r-${d.index}`} />
              return (
                <g key="end-rate">
                  <circle cx={d.cx as number} cy={d.cy as number} r={3.5} fill="#1A7B8A" stroke="#fff" strokeWidth={2} />
                  <text x={(d.cx as number) + 8} y={d.cy as number} dy="0.35em" fontSize={11} fontWeight={800} fill="#1A7B8A"
                    style={{ fontVariantNumeric: 'tabular-nums' }}>{latest.fillRate}%</text>
                </g>
              )
            }}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: '#1A7B8A' }} />
        </LineChart>
      </ResponsiveContainer>
    </DashCard>
  )
}

/** "Filled 166", printed just right of the last reading. */
function EndLabel({ x, y, name, value, colour }: { x: number; y: number; name: string; value: number; colour: string }) {
  return (
    <text x={x + 8} y={y} dy="0.35em" fontSize={11} style={{ fontVariantNumeric: 'tabular-nums' }}>
      <tspan fill="#64748B" fontWeight={600}>{name} </tspan>
      <tspan fill={colour} fontWeight={800}>{value.toLocaleString()}</tspan>
    </text>
  )
}

/** The day, both bands and the fill rate. */
function HistoryTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) {
  const p = payload?.[0]?.payload as Point | undefined
  if (!active || !p) return null
  const rows: { label: string; value: string; colour?: string }[] = [
    { label: 'Filled', value: p.booked.toLocaleString(), colour: FILLED },
    { label: 'Open', value: p.open.toLocaleString(), colour: OPEN_FILL },
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
            {r.colour ? <span aria-hidden className="inline-block rounded-sm" style={{ width: 8, height: 8, background: r.colour }} />
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
      <div className="rounded-xl" style={CARD_STYLE}>
        <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-2/3 mt-2" />
        </div>
        <div className="p-5"><Skeleton className="h-[300px]" /></div>
      </div>
    </div>
  )
}

// ── Week on week ────────────────────────────────────────────────────────────
//
// The charts show the shape of the board over time, which is the wrong tool
// for the question actually asked: is it up or down on last week, and by how
// much. An area chart makes a change of six slots and a change of sixty look
// much the same, and reading one department out of a stacked band is guesswork.
//
// So: a reading per week per department, the way front desk already keep it on
// paper, with the change from the week before printed next to it.

type Reading = { total: number; booked: number; blocked: number; open: number }
interface WeeklyData {
  weekday: number
  columns: { date: string; label: string }[]
  departments: string[]
  cells: { department: string; readings: (Reading | null)[]; live: Reading | null }[]
  totals: { readings: (Reading | null)[]; live: Reading | null }
}

const WEEKDAYS = [
  { id: '0', label: 'Sun' }, { id: '1', label: 'Mon' }, { id: '2', label: 'Tue' },
  { id: '3', label: 'Wed' }, { id: '4', label: 'Thu' }, { id: '5', label: 'Fri' }, { id: '6', label: 'Sat' },
]
const WEEK_COUNTS = [{ id: '8', label: '8 weeks' }, { id: '12', label: '12 weeks' }, { id: '26', label: '26 weeks' }]

type Metric = 'open' | 'booked' | 'fill'
const METRICS: { id: Metric; label: string }[] = [
  { id: 'open', label: 'Open slots' },
  { id: 'booked', label: 'Booked' },
  { id: 'fill', label: 'Fill rate' },
]

/** The number this table is showing, out of one reading. */
function valueOf(r: Reading | null, metric: Metric): number | null {
  if (!r) return null
  if (metric === 'open') return r.open
  if (metric === 'booked') return r.booked
  const bookable = r.booked + r.open
  return bookable > 0 ? Math.round((r.booked / bookable) * 100) : null
}

/**
 * Which direction is the good one.
 *
 * Fewer OPEN hours means a busier clinic; fewer BOOKED hours does not. Colour
 * that says "down is bad" on both would be worse than no colour, so the table
 * asks the metric rather than assuming.
 */
const goodWhenRising = (metric: Metric) => metric !== 'open'

function DeltaChip({ delta, metric }: { delta: number | null; metric: Metric }) {
  if (delta === null) return null
  if (delta === 0) {
    return <span className="block text-[10px] leading-none mt-0.5" style={{ color: '#9AA0A6' }}>no change</span>
  }
  const good = delta > 0 === goodWhenRising(metric)
  const Icon = delta > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className="flex items-center justify-end gap-0.5 text-[10px] font-bold leading-none mt-0.5"
      style={{ color: good ? '#166534' : '#B0453A' }}>
      <Icon size={9} aria-hidden />
      {delta > 0 ? '+' : ''}{delta}{metric === 'fill' ? 'pt' : ''}
    </span>
  )
}

function WeeklyTable({ branch }: { branch: string }) {
  const [weekday, setWeekday] = useState('1')
  const [weeks, setWeeks] = useState('12')
  const [metric, setMetric] = useState<Metric>('open')
  const [data, setData] = useState<WeeklyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const ctl = new AbortController()
    setLoading(true); setError('')
    const p = new URLSearchParams({ branch, weekday, weeks })
    fetch(`/api/decking/history/weekly?${p}`, { signal: ctl.signal })
      .then(r => { if (!r.ok) throw new Error(`Couldn't load the weekly table (${r.status})`); return r.json() })
      .then(setData)
      .catch(err => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => setLoading(false))
    return () => ctl.abort()
  }, [branch, weekday, weeks])

  const unit = metric === 'fill' ? '%' : ''
  const rows = data
    ? [...data.cells, { department: 'ALL', readings: data.totals.readings, live: data.totals.live }]
    : []

  return (
    <DashCard title="Week on week" icon={<Layers size={15} />}
      description={`One reading per week, taken each ${WEEKDAYS[Number(weekday)].label}. The figure under each number is the change from the week before.`}>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 mb-3">
        <div>
          <span className={LABEL} style={{ color: 'var(--mid-gray)' }}>Showing</span>
          <PillTabs label="Metric" size="sm" tabs={METRICS} value={metric} onChange={v => setMetric(v as Metric)} />
        </div>
        <div>
          <span className={LABEL} style={{ color: 'var(--mid-gray)' }}>Counted every</span>
          <PillTabs label="Weekday counted" size="sm" tabs={WEEKDAYS} value={weekday} onChange={setWeekday} />
        </div>
        <div>
          <span className={LABEL} style={{ color: 'var(--mid-gray)' }}>Going back</span>
          <PillTabs label="Weeks shown" size="sm" tabs={WEEK_COUNTS} value={weeks} onChange={setWeeks} />
        </div>
        <span className="flex items-center gap-1.5 h-9 ml-auto text-[11px]" style={{ color: 'var(--mid-gray)' }} aria-live="polite">
          {loading && data && <><Loader2 size={12} className="animate-spin" /> Updating…</>}
        </span>
      </div>

      {error ? (
        <EmptyState title="Couldn't load the weekly table" hint={error} />
      ) : loading && !data ? (
        <Skeleton className="h-48 w-full" />
      ) : !data || data.departments.length === 0 ? (
        <EmptyState title="No weekly readings yet"
          hint="A reading is taken once a day. Once a few have landed on the weekday you picked, the columns fill in from the left." />
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full border-collapse text-[12px]">
            <caption className="sr-only">
              {METRICS.find(m => m.id === metric)?.label} per department, one reading each week
            </caption>
            <thead>
              <tr>
                <th scope="col" className="text-left font-bold px-2 py-1.5 sticky left-0 z-10"
                  style={{ background: 'var(--card, #fff)', color: '#1F3A5F' }}>Department</th>
                <th scope="col" className="text-right font-bold px-2 py-1.5"
                  style={{ color: '#1F3A5F', background: '#EEF4FA' }}>Live</th>
                {data.columns.map(c => (
                  <th key={c.date} scope="col" className="text-right font-semibold px-2 py-1.5 whitespace-nowrap"
                    style={{ color: 'var(--mid-gray)' }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isTotal = row.department === 'ALL'
                const liveValue = valueOf(row.live, metric)
                const lastRecorded = [...row.readings].reverse().find(r => r !== null) ?? null
                return (
                  <tr key={row.department} style={isTotal ? { borderTop: '2px solid #D5DEE8' } : undefined}>
                    <th scope="row" className="text-left px-2 py-1.5 sticky left-0 z-10 whitespace-nowrap"
                      style={{ background: 'var(--card, #fff)', fontWeight: isTotal ? 800 : 600, color: isTotal ? '#1F3A5F' : '#334E68' }}>
                      {isTotal ? 'All departments' : row.department}
                    </th>
                    <td className="text-right px-2 py-1.5 align-top" style={{ background: '#EEF4FA' }}>
                      <span className="font-bold tabular-nums" style={{ color: '#1F3A5F' }}>
                        {liveValue === null ? '—' : `${liveValue}${unit}`}
                      </span>
                      <DeltaChip metric={metric}
                        delta={liveValue === null || valueOf(lastRecorded, metric) === null
                          ? null : liveValue - (valueOf(lastRecorded, metric) as number)} />
                    </td>
                    {row.readings.map((r, i) => {
                      const v = valueOf(r, metric)
                      const prev = valueOf(row.readings[i - 1] ?? null, metric)
                      return (
                        <td key={data.columns[i].date} className="text-right px-2 py-1.5 align-top tabular-nums">
                          {/* Blank, not zero: "nobody recorded it" and "there
                              were none" are different facts. */}
                          {v === null ? <span style={{ color: '#C8CDD3' }}>·</span> : (
                            <>
                              <span className="font-semibold" style={{ color: '#334E68' }}>{v}{unit}</span>
                              <DeltaChip metric={metric} delta={prev === null ? null : v - prev} />
                            </>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashCard>
  )
}
