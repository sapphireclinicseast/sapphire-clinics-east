'use client'

// Filled slots over time: one column per day, each built of stacked bricks.
//
// Why bricks rather than the stacked area this replaced. The area drew filled
// beneath open, so the thing the desk actually watches — did we book more
// children than yesterday — was a seam between two bands on an axis running to
// several hundred, where four more bookings moved it by about a pixel. A column
// of countable bricks turns the same change into a brick you can see appear.
// The cost is that composition is no longer in this chart: "how much could we
// have sold" now lives only in the tiles and the fill-rate panel. That is the
// trade asked for — one question per chart, answered obviously.
//
// Only filled is drawn. Open and unavailable hours are not a second series
// here; a chart with one series needs no legend, and the title names it.
//
// From zero, never a cut axis: a column read off a truncated baseline misstates
// how much it grew, which is the one thing these columns are for.
//
// One brick is a fixed number of slots, chosen so the tallest day is 6–14
// bricks high — few enough to count at a glance, tall enough that one brick is
// a visible step. The top brick is drawn part-height when the day's figure is
// not a whole multiple, so a column's height stays exactly proportional to its
// value and the bricks never round the number up.

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
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

/** One day's figures for one department, as the table reads them. */
interface Reading { totalSlots: number; booked: number; blocked: number; open: number }
interface DeptSeries { department: string; readings: (Reading | null)[] }
interface Column { date: string; label: string }

function isoDaysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

/** Bookable = what could be sold: filled + open. Unavailable hours are not in it. */
const bookableOf = (p: Point) => p.booked + p.open

export default function DeckingHistory({ branch }: { branch: string }) {
  const [dept, setDept] = useState('all')
  // 30 days by default, not 90: the columns are meant to be counted, and at
  // ninety of them a brick is narrower than it is tall.
  const [from, setFrom] = useState(isoDaysAgo(29))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [points, setPoints] = useState<Point[]>([])
  const [columns, setColumns] = useState<Column[]>([])
  const [perDepartment, setPerDepartment] = useState<DeptSeries[]>([])
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
        setColumns(d.columns ?? [])
        setPerDepartment(d.perDepartment ?? [])
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
                { id: '14', label: '14 days', from: isoDaysAgo(13) },
                { id: '30', label: '30 days', from: isoDaysAgo(29) },
                { id: '90', label: '90 days', from: isoDaysAgo(89) },
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

          <BrickChart points={points} firstRecorded={firstRecorded} />
          {/* The chart shows the shape; this says whether it went up or down
              and by how much, per department, which no single column can. */}
          <DayTable columns={columns} perDepartment={perDepartment} />
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

// Plot geometry. The y-axis starts at zero, so the baseline is the bottom of
// the plot area. Top margin leaves room for the label above the last column.
const CHART_H = 300
// Right margin holds the "start" datum's label. It has to live outside the
// plot: filled slots rarely fall near zero, so the columns reach most of the
// way up and an inline label lands on dark green, where it cannot be read.
const CHART_MARGIN = { top: 22, right: 62, bottom: 0, left: -8 }
const X_AXIS_H = 22

// ── The brick chart ─────────────────────────────────────────────────────────

/** Brick sizes worth printing on a card: a reader can multiply by these. */
const BRICK_UNITS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
/** How many bricks the tallest column may be — countable at a glance. */
const MAX_BRICKS = 14
const BRICK_GAP = 2        // surface gap between bricks, per the mark specs
const BRICK_MAX_W = 24     // bars are capped; the band's leftover stays as air

/**
 * How many slots one brick stands for.
 *
 * The smallest size on the list that fits the tallest day into MAX_BRICKS, so
 * the bricks are as fine-grained as the cap allows. A range topping out at 166
 * filled slots takes bricks of 20 — the first size that keeps it under 14 —
 * and reads as a column of eight and a bit.
 */
function brickUnit(max: number) {
  return BRICK_UNITS.find(u => max / u <= MAX_BRICKS) ?? Math.ceil(max / MAX_BRICKS)
}

/** A rect with only its top corners rounded — the data-end, square at the baseline. */
function topRoundedPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, h, w / 2))
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y}`
    + ` L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}

interface BrickProps {
  x?: number; y?: number; width?: number; height?: number
  index?: number; payload?: Point
  unit: number; lastIndex: number; latestDelta: number | null
}

/**
 * One day's column, drawn as bricks stacked from the baseline.
 *
 * The partial top brick is what keeps this honest: full bricks are whole
 * multiples of the unit and the remainder is drawn at its true fraction of a
 * brick, so the column's total height is the value, not the value rounded to
 * the nearest brick.
 */
function BrickColumn(props: BrickProps) {
  const { x = 0, y = 0, width = 0, height = 0, index = 0, payload, unit, lastIndex, latestDelta } = props
  const value = payload?.booked ?? 0
  if (!Number.isFinite(height) || height <= 0 || value <= 0) return <g />

  const pitch = height / (value / unit)          // pixels per whole brick
  const gap = pitch >= 8 ? BRICK_GAP : 1         // a 2px gap would eat a short brick
  const w = Math.min(BRICK_MAX_W, width)
  const bx = x + (width - w) / 2
  const baseline = y + height

  const full = Math.floor(value / unit + 1e-9)
  const remainder = value - full * unit
  const bricks: { top: number; h: number }[] = []
  for (let i = 0; i < full; i++) {
    bricks.push({ top: baseline - (i + 1) * pitch, h: pitch - gap })
  }
  if (remainder > 1e-9) {
    const h = (remainder / unit) * pitch - gap
    // A sliver thinner than a hairline reads as dirt, not data; the column's
    // height already carries it, and the exact figure is in the tooltip.
    if (h >= 1) bricks.push({ top: y, h })
  }
  const top = bricks[bricks.length - 1]

  const isLast = index === lastIndex
  const tone = latestDelta === null || latestDelta === 0 ? 'var(--charcoal)' : latestDelta > 0 ? FILLED : '#B0453A'

  return (
    <g>
      {bricks.map((b, i) => (
        i === bricks.length - 1
          // 4px rounded data-end on the cap only.
          ? <path key={i} d={topRoundedPath(bx, b.top, w, b.h, 4)} fill={FILLED} />
          : <rect key={i} x={bx} y={b.top} width={w} height={Math.max(0, b.h)} fill={FILLED} />
      ))}
      {/* Labelled selectively: the last column only, because that is the one
          the reader is asking about. The rest are carried by the axis, the
          tooltip and the table. */}
      {isLast && top && (
        // Haloed in the surface colour rather than placed to avoid collisions:
        // the last column is often shorter than the one before it, and the
        // label then sits over that neighbour's bricks. paintOrder puts the
        // stroke under the glyphs, so it reads as a gap, not an outline.
        <text x={bx + w / 2} y={Math.max(11, top.top - 7)} textAnchor="middle"
          fontSize={11} fontWeight={800} fill="var(--charcoal)"
          stroke="#fff" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">
          {value.toLocaleString()}
          {latestDelta !== null && latestDelta !== 0 && (
            <tspan fill={tone} fontWeight={700}> {latestDelta > 0 ? '+' : '−'}{Math.abs(latestDelta)}</tspan>
          )}
        </text>
      )}
    </g>
  )
}

function BrickChart({ points, firstRecorded }: { points: Point[]; firstRecorded: string | null }) {
  const lastIndex = points.length - 1
  const latest = points[lastIndex]
  const first = points[0]

  const { unit, axisMax } = useMemo(() => {
    const max = Math.max(...points.map(p => p.booked), 1)
    const u = brickUnit(max)
    // The top of the axis is a whole brick, so the last gridline is a brick
    // edge rather than cutting one in half.
    return { unit: u, axisMax: Math.ceil(max / u) * u }
  }, [points])

  // Change from the day before, for the tooltip and the end label.
  const deltas = useMemo(() => points.map((p, i) => i === 0 ? null : p.booked - points[i - 1].booked), [points])
  const deltaByDate = useMemo(
    () => Object.fromEntries(points.map((p, i) => [p.date, deltas[i]])) as Record<string, number | null>,
    [points, deltas])

  // At most six labels on the y-axis, always on brick edges.
  const ticks = useMemo(() => {
    const bricks = axisMax / unit
    const stride = Math.ceil(bricks / 5)
    const out: number[] = []
    for (let b = 0; b <= bricks; b += stride) out.push(b * unit)
    if (out[out.length - 1] !== axisMax) out.push(axisMax)
    return out
  }, [axisMax, unit])

  return (
    <DashCard
      title="Filled slots each day"
      icon={<Layers size={15} />}
      description={<>
        One column per day, built of bricks. <strong>Each brick is {unit.toLocaleString()} filled
        slot{unit === 1 ? '' : 's'}</strong> — a column that gains a brick gained {unit.toLocaleString()}{' '}
        booking{unit === 1 ? '' : 's'}.
      </>}
      footer={firstRecorded ? (
        <>History begins {new Date(`${firstRecorded}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} —
          the first day a reading was taken. Nothing before that was recorded.</>
      ) : undefined}
    >
      {/* Animation off: it stalled on the first frame elsewhere in this module
          and drew nothing at all. */}
      <ResponsiveContainer width="100%" height={CHART_H}>
        <BarChart data={points} margin={CHART_MARGIN} barCategoryGap="12%">
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          {/* minTickGap drops labels rather than overprinting them: every date
              will not fit once the range is more than a few weeks. */}
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }}
            height={X_AXIS_H} minTickGap={16} interval="preserveStartEnd" />
          {/* Grouped, so the axis and the column labels write a thousand the
              same way; width follows, or four digits clip. */}
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false}
            width={axisMax >= 1000 ? 52 : 44} domain={[0, axisMax]} ticks={ticks}
            tickFormatter={v => Number(v).toLocaleString()} />
          <Tooltip content={p => <HistoryTooltip active={p.active} payload={p.payload} deltaByDate={deltaByDate} />}
            cursor={{ fill: 'rgba(22,101,52,0.06)' }} />
          <Bar dataKey="booked" name="Filled" isAnimationActive={false}
            shape={(p: object) => (
              <BrickColumn {...(p as BrickProps)} unit={unit} lastIndex={lastIndex}
                latestDelta={deltas[lastIndex] ?? null} />
            )} />
          {/* Where the range started, so "are we above where we began" is read
              off the chart rather than worked out. This is the whole reason the
              columns are legible at all on a zero baseline: filled rarely goes
              to nothing, so every column is tall and the differences live in
              the top fifth. The line puts a datum across them.
              After <Bar>, deliberately — Recharts paints in JSX order, and
              behind the columns the line is invisible exactly where it is being
              read. Solid hairline; a dash here would read as a target. */}
          {first && points.length > 1 && (
            <ReferenceLine y={first.booked} stroke="#475569" strokeWidth={1} ifOverflow="extendDomain"
              label={{ value: `start ${first.booked.toLocaleString()}`, position: 'right', fontSize: 10, fontWeight: 700, fill: '#475569' }} />
          )}
        </BarChart>
      </ResponsiveContainer>

      {latest && (
        <p className="mt-3 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
          {points.length === 1
            ? <>One reading so far — {latest.booked.toLocaleString()} filled on {latest.label}. A second day gives something to compare it against.</>
            : <>{latest.label}: <strong style={{ color: 'var(--charcoal)' }}>{latest.booked.toLocaleString()} filled</strong>
              {' · '}{describeDelta(deltas[lastIndex])} on the day before
              {first && first.date !== latest.date && <> · {describeDelta(latest.booked - first.booked)} since {first.label}</>}
            </>}
        </p>
      )}
    </DashCard>
  )
}

/** "up 4", "down 11", "unchanged" — in words, so it reads without the colour. */
function describeDelta(delta: number | null | undefined) {
  if (delta === null || delta === undefined) return 'no earlier reading'
  if (delta === 0) return 'unchanged'
  return `${delta > 0 ? 'up' : 'down'} ${Math.abs(delta).toLocaleString()}`
}

/**
 * Fill rate on its own axis (0–100%). The bricks above show how many slots were
 * filled; this shows what share of the bookable ones that was, which a count
 * cannot say — thirty filled is good on a thin day and poor on a full one.
 * Its own chart, never a second axis on the first.
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

/**
 * The day's figures, and what filled did between the day before and this one.
 *
 * The change is keyed by date rather than by the payload's index: Recharts
 * hands the tooltip one point, and which point it is cannot be read off that
 * object reliably — the date can.
 */
function HistoryTooltip({ active, payload, deltaByDate }: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: unknown }>
  deltaByDate?: Record<string, number | null>
}) {
  const p = payload?.[0]?.payload as Point | undefined
  if (!active || !p) return null
  const delta = deltaByDate ? deltaByDate[p.date] ?? null : null
  const rows: { label: string; value: string; colour?: string }[] = [
    { label: 'Filled', value: p.booked.toLocaleString(), colour: FILLED },
    ...(deltaByDate ? [{ label: 'vs day before', value: delta === null ? '—' : `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(delta)}` }] : []),
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

// ── Day on day ──────────────────────────────────────────────────────────────
//
// The chart shows one line of columns — everything the filters left, summed.
// This is the same days split by department, because "SPED is down eleven and
// OT is up nine" is the sentence front desk act on, and a single column can
// only say the two cancelled out.
//
// Days run left to right, newest last, so the table reads in the same
// direction as the chart above it. The figure under each number is the change
// from the day before it in this table — not from the calendar day before,
// which may have no reading at all.

type Metric = 'booked' | 'open' | 'fill'
const METRICS: { id: Metric; label: string }[] = [
  { id: 'booked', label: 'Filled' },
  { id: 'open', label: 'Open slots' },
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
 * Fewer OPEN hours means a busier clinic; fewer FILLED hours does not. Colour
 * that says "down is bad" on both would be worse than no colour, so the table
 * asks the metric rather than assuming.
 */
const goodWhenRising = (metric: Metric) => metric !== 'open'

function DeltaChip({ delta, metric }: { delta: number | null; metric: Metric }) {
  if (delta === null) return null
  if (delta === 0) {
    return <span className="block text-[10px] leading-none mt-0.5" style={{ color: '#9AA0A6' }}>—</span>
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

const add = (a: Reading, b: Reading): Reading => ({
  totalSlots: a.totalSlots + b.totalSlots, booked: a.booked + b.booked,
  blocked: a.blocked + b.blocked, open: a.open + b.open,
})

function DayTable({ columns, perDepartment }: { columns: Column[]; perDepartment: DeptSeries[] }) {
  const [metric, setMetric] = useState<Metric>('booked')

  // One extra row: every department added up, per day. Built here rather than
  // on the server so it always agrees with the rows above it, whatever the
  // filters left.
  //
  // A day where some department has no reading is tracked as it is built. The
  // sum of what was recorded is still worth showing, but the CHANGE across such
  // a day is not: a night the cron half-failed would otherwise read as the
  // clinic losing thirty bookings. So the figure stays and its delta is
  // withheld, with the missing departments named on hover.
  const { totals, missing } = useMemo(() => {
    const totals: (Reading | null)[] = []
    const missing: string[][] = []
    columns.forEach((_, i) => {
      const present = perDepartment.filter(d => d.readings[i] !== null)
      totals.push(present.length ? present.map(d => d.readings[i] as Reading).reduce(add) : null)
      missing.push(perDepartment.filter(d => d.readings[i] === null).map(d => d.department))
    })
    return { totals, missing }
  }, [columns, perDepartment])

  const rows = [
    ...perDepartment,
    ...(perDepartment.length > 1 ? [{ department: 'ALL', readings: totals }] : []),
  ]
  const unit = metric === 'fill' ? '%' : ''

  return (
    <DashCard title="Day on day" icon={<Layers size={15} />}
      description={<>One reading per day, per department. The figure under each number is the change from the
        column before it. A dot means nothing was recorded that day; <span style={{ color: '#B0453A' }}>*</span> on
        a total means not every department was, so its change is left out rather than counted as a drop.</>}>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 mb-3">
        <div>
          <span className={LABEL} style={{ color: 'var(--mid-gray)' }}>Showing</span>
          <PillTabs label="Metric" size="sm" tabs={METRICS} value={metric} onChange={v => setMetric(v as Metric)} />
        </div>
        <span className="text-[11px] self-center" style={{ color: 'var(--mid-gray)' }}>
          Department and dates are set above — this table follows them.
        </span>
      </div>

      {rows.length === 0 || columns.length === 0 ? (
        <EmptyState title="No readings in this range"
          hint="A reading is taken once a day. Once a few have landed, the columns fill in from the left." />
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full border-collapse text-[12px]">
            <caption className="sr-only">
              {METRICS.find(m => m.id === metric)?.label} per department, one reading each day
            </caption>
            <thead>
              <tr>
                <th scope="col" className="text-left font-bold px-2 py-1.5 sticky left-0 z-10"
                  style={{ background: 'var(--card, #fff)', color: '#1F3A5F' }}>Department</th>
                {columns.map(c => (
                  <th key={c.date} scope="col" className="text-right font-semibold px-2 py-1.5 whitespace-nowrap"
                    style={{ color: 'var(--mid-gray)' }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isTotal = row.department === 'ALL'
                return (
                  <tr key={row.department} style={isTotal ? { borderTop: '2px solid #D5DEE8' } : undefined}>
                    <th scope="row" className="text-left px-2 py-1.5 sticky left-0 z-10 whitespace-nowrap"
                      style={{ background: 'var(--card, #fff)', fontWeight: isTotal ? 800 : 600, color: isTotal ? '#1F3A5F' : '#334E68' }}>
                      {isTotal ? 'All departments' : row.department}
                    </th>
                    {row.readings.map((r, i) => {
                      const v = valueOf(r, metric)
                      const prev = valueOf(row.readings[i - 1] ?? null, metric)
                      // A total is incomplete when this day or the one it is
                      // compared against was missing a department.
                      const gap = isTotal && (missing[i]?.length || missing[i - 1]?.length)
                        ? [...new Set([...(missing[i] ?? []), ...(missing[i - 1] ?? [])])]
                        : []
                      return (
                        <td key={columns[i].date} className="text-right px-2 py-1.5 align-top tabular-nums"
                          title={gap.length ? `Not every department was recorded — ${gap.join(', ')} missing. The change is left out rather than counted as a drop.` : undefined}>
                          {/* Blank, not zero: "nobody recorded it" and "there
                              were none" are different facts. */}
                          {v === null ? <span style={{ color: '#C8CDD3' }}>·</span> : (
                            <>
                              <span className="font-semibold" style={{ color: '#334E68' }}>
                                {v}{unit}{gap.length > 0 && <span style={{ color: '#B0453A' }}>*</span>}
                              </span>
                              {gap.length > 0
                                ? <span className="block text-[10px] leading-none mt-0.5" style={{ color: '#9AA0A6' }}>part</span>
                                : <DeltaChip metric={metric} delta={prev === null ? null : v - prev} />}
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
