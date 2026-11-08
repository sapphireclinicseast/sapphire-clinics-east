'use client'

// Decking Per Day — the whole week on one screen, so a daily session target can
// be set against what is actually decked.
//
// The other Decking sections answer "what does this consultant's week look
// like"; this one answers "how many sessions does this branch run on a Tuesday".
// That is a different cut of the same DeckingSlot rows: every department at
// once, grouped by day rather than by person.

import type { CSSProperties, ReactNode } from 'react'
import { AlertTriangle, CalendarCheck, CalendarDays, Gauge, TrendingDown, TrendingUp } from 'lucide-react'
import { deptColor } from '@/lib/dept-colors'
import { DashCard, KpiCard, Skeleton, EmptyState } from '../patients/dashboard/ui'
import { SUBTLE_BG } from './ui'

// Sunday first, matching how the clinic reads a week.
// Sunday → Saturday, shared with the rest of the module.
import { DAYS } from '@/lib/decking-days'

export interface PerDaySlot {
  dayOfWeek: string
  department: string
  disabled: boolean
  patientId: string | null
  paymentType?: string
}

type Pay = 'CASH' | 'HMO' | 'GL'
const PAYS: Pay[] = ['CASH', 'HMO', 'GL']
// Same colours as the board, so a number here means the same thing a cell there
// means. Diverging would make the two screens quietly contradict each other.
// `bar` is the board's PAY_STYLE border tone — the one its own payment-mix bar
// is drawn in — since the pale `bg` disappears at bar height.
const PAY_UI: Record<Pay, { label: string; fg: string; bg: string; bar: string }> = {
  CASH: { label: 'Cash', fg: '#14507F', bg: '#E3EEFB', bar: '#A9CBEC' },
  HMO:  { label: 'HMO',  fg: '#5B2A86', bg: '#EFE4FA', bar: '#C9AEE6' },
  GL:   { label: 'GL',   fg: '#93460B', bg: '#FDEAD6', bar: '#F3C69B' },
}

// Over-booked is a warning, so it gets the one non-teal accent on the screen —
// always paired with an icon and words, never colour alone.
const WARN = { fg: '#991B1B', bg: '#FEF2F2', border: '#FECACA' }
const MUTED = '#CBD5E1'
const RULE = '#EEF2F1'

// One sequential teal ramp for every table, light → dark. Text flips to white
// only on the two darkest steps, where white clears 4.5:1; the lighter four
// carry dark teal text, which clears it on each of them.
const HEAT: { bg: string; fg: string }[] = [
  { bg: '#E6F3F5', fg: '#0B3A41' },
  { bg: '#C4E4E8', fg: '#0B3A41' },
  { bg: '#93CCD4', fg: '#0B3A41' },
  { bg: '#5FAFBA', fg: '#0B3A41' },
  { bg: '#1A7B8A', fg: '#FFFFFF' },
  { bg: '#0F5C67', fg: '#FFFFFF' },
]
function heatOf(n: number, max: number) {
  if (n <= 0 || max <= 0) return null
  const step = Math.min(HEAT.length, Math.max(1, Math.ceil((n / max) * HEAT.length)))
  return HEAT[step - 1]
}

// The three tables on this screen are read against each other — decked, offered,
// still open for the same day — so their columns have to line up. Each sizes
// itself independently otherwise, and SUN in one sits over MON in the next.
// Fixed layout plus one shared colgroup is what makes the grids align.
const TABLE_MIN_WIDTH = 760
const tableStyle: CSSProperties = {
  width: '100%', borderCollapse: 'separate', borderSpacing: 0,
  tableLayout: 'fixed', minWidth: TABLE_MIN_WIDTH,
}
function DayCols() {
  return (
    <colgroup>
      <col style={{ width: '15%' }} />
      {DAYS.map(d => <col key={d.key} style={{ width: '10%' }} />)}
      <col style={{ width: '15%' }} />
    </colgroup>
  )
}

// Shared cell styles. The first column and the header row are sticky inside the
// card's own scroll box, so they need opaque backgrounds and an explicit stack.
const TH_BASE: CSSProperties = {
  position: 'sticky', top: 0, zIndex: 2, background: SUBTLE_BG,
  padding: '0.55rem 0.4rem', textAlign: 'center', fontSize: '0.68rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--mid-gray)',
  borderBottom: '1px solid var(--light-gray)',
}
const TH_CORNER: CSSProperties = { ...TH_BASE, left: 0, zIndex: 3, textAlign: 'left', paddingLeft: '1.25rem' }
const TD_BASE: CSSProperties = {
  padding: '0.45rem 0.35rem', textAlign: 'center', fontSize: '0.82rem',
  borderBottom: `1px solid ${RULE}`, fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle',
}
const TD_FIRST: CSSProperties = {
  ...TD_BASE, position: 'sticky', left: 0, zIndex: 1, background: '#fff',
  textAlign: 'left', paddingLeft: '1.25rem', borderRight: `1px solid ${RULE}`,
}
const TD_WEEK: CSSProperties = { ...TD_BASE, background: '#FAFCFB', borderLeft: `1px solid ${RULE}`, fontWeight: 700, color: 'var(--charcoal)' }
const TOTAL_BG = '#F1F7F6'
const SCROLL_BOX: CSSProperties = { overflow: 'auto', maxHeight: '34rem' }

function payOfSlot(s: PerDaySlot): Pay {
  return (PAYS as string[]).includes(s.paymentType ?? '') ? (s.paymentType as Pay) : 'CASH'
}
// Percentages are of the DAY, which is what makes them comparable across a row —
// "Tuesday is 40% HMO" is a fact you can act on; "Tuesday is 4% of the week"
// is not. Guarded so an empty day shows 0 rather than NaN.
function pct(n: number, of: number): number {
  return of > 0 ? Math.round((n / of) * 100) : 0
}

export default function DeckingPerDay({
  slots, departments, branchName, capacity = {},
}: {
  slots: PerDaySlot[]
  departments: string[]
  branchName: string
  /** department → day → hours the consultants offered. Capacity, not bookings. */
  capacity?: Record<string, Record<string, number>>
}) {
  // Disabled slots are switched-off time, not sessions — counting them would
  // inflate the very number the target is set against.
  const live = slots.filter(s => !s.disabled)

  const countsByDept = new Map<string, Map<string, number>>()
  const filledByDept = new Map<string, Map<string, number>>()
  for (const s of live) {
    if (!countsByDept.has(s.department)) {
      countsByDept.set(s.department, new Map())
      filledByDept.set(s.department, new Map())
    }
    const row = countsByDept.get(s.department)!
    row.set(s.dayOfWeek, (row.get(s.dayOfWeek) ?? 0) + 1)
    if (s.patientId) {
      const f = filledByDept.get(s.department)!
      f.set(s.dayOfWeek, (f.get(s.dayOfWeek) ?? 0) + 1)
    }
  }

  // Only departments that actually have slots — an empty row per department the
  // branch doesn't run would bury the ones that matter.
  // Payment split, per department per day and per day overall. Built in the same
  // pass shape as the counts above so the two can never disagree.
  const payByDeptDay = new Map<string, Map<string, Record<Pay, number>>>()
  const payByDay = new Map<string, Record<Pay, number>>()
  const payWeek: Record<Pay, number> = { CASH: 0, HMO: 0, GL: 0 }
  for (const s of live) {
    const pay = payOfSlot(s)
    if (!payByDeptDay.has(s.department)) payByDeptDay.set(s.department, new Map())
    const byDay = payByDeptDay.get(s.department)!
    if (!byDay.has(s.dayOfWeek)) byDay.set(s.dayOfWeek, { CASH: 0, HMO: 0, GL: 0 })
    byDay.get(s.dayOfWeek)![pay]++
    if (!payByDay.has(s.dayOfWeek)) payByDay.set(s.dayOfWeek, { CASH: 0, HMO: 0, GL: 0 })
    payByDay.get(s.dayOfWeek)![pay]++
    payWeek[pay]++
  }

  // Hours switched off (marked unavailable). They are NOT capacity: they are
  // taken out of the offered hours before anything is computed from them, and
  // reported beside the numbers as their own muted count — the same rule as
  // the Capacity card and the KPI row on the boards, where the percentage is
  // booked ÷ (booked + open) and unavailable never enters it.
  const blockedByDept = new Map<string, Map<string, number>>()
  for (const s of slots.filter(x => x.disabled)) {
    if (!blockedByDept.has(s.department)) blockedByDept.set(s.department, new Map())
    const m = blockedByDept.get(s.department)!
    m.set(s.dayOfWeek, (m.get(s.dayOfWeek) ?? 0) + 1)
  }

  // Any department the DATA mentions, whether or not the caller listed it.
  //
  // This screen used to trust `departments` completely, so a list that did not
  // mention a department made its sessions vanish from every table while the
  // payment split beside them still counted them — the screen contradicted
  // itself rather than showing a gap. The caller's order is kept, because it is
  // the clinic's reading order; anything extra is appended rather than dropped.
  const knownDepts = (() => {
    const extra = [...new Set([...live.map(s => s.department), ...Object.keys(capacity)])]
      .filter(d => d && !departments.includes(d))
      .sort()
    return [...departments, ...extra]
  })()

  // Departments with capacity but nothing decked still belong on the capacity
  // tables — an empty department is exactly what a cross-sell conversation
  // needs to see.
  const capacityDepts = knownDepts.filter(d => capacity[d] && Object.keys(capacity[d]).length > 0)
  const capOf = (dept: string, day: string) => capacity[dept]?.[day] ?? 0
  const deckedOf = (dept: string, day: string) => countsByDept.get(dept)?.get(day) ?? 0
  const blockedOf = (dept: string, day: string) => blockedByDept.get(dept)?.get(day) ?? 0
  // Bookable hours: what the consultants offered, minus what is marked
  // unavailable. This — not the raw offered hours — is the capacity every
  // figure on this screen is measured against. Floored at zero: an unavailable
  // row on a day that is no longer a work day must not make capacity negative.
  const bookableOf = (dept: string, day: string) =>
    Math.max(0, capOf(dept, day) - blockedOf(dept, day))
  // Floored at zero: more decked than capacity means the config was narrowed
  // after the sessions were booked, and a negative "available" would read as a
  // data error rather than the over-booking it is.
  const availOf = (dept: string, day: string) =>
    Math.max(0, bookableOf(dept, day) - deckedOf(dept, day))
  // How far past the bookable hours a day is decked. Without this the floor at
  // zero hides the difference between "exactly full" and "over-booked by two",
  // and those call for opposite actions — one is healthy, the other means the
  // consultant's configured work days do not match what they are actually
  // doing, so every capacity figure for them is understated. Unavailable hours
  // are not bookings, so they never count towards it.
  const overOf = (dept: string, day: string) =>
    Math.max(0, deckedOf(dept, day) - bookableOf(dept, day))

  const rows = knownDepts.filter(d => countsByDept.has(d))
  const dayTotal = (day: string) =>
    rows.reduce((n, d) => n + (countsByDept.get(d)?.get(day) ?? 0), 0)
  const dayFilled = (day: string) =>
    rows.reduce((n, d) => n + (filledByDept.get(d)?.get(day) ?? 0), 0)
  const weekTotal = DAYS.reduce((n, d) => n + dayTotal(d.key), 0)
  const weekFilled = DAYS.reduce((n, d) => n + dayFilled(d.key), 0)

  // ── Per-day roll-ups for the KPI row and the week strip ──────────────────
  // Display only: every one is a sum of the per-department figures the tables
  // below already show, so a card can never disagree with the table under it.
  const sumCap = (fn: (dept: string, day: string) => number, day: string) =>
    capacityDepts.reduce((n, dept) => n + fn(dept, day), 0)
  const perDay = DAYS.map(d => {
    const decked = dayTotal(d.key)
    const open = sumCap(availOf, d.key)
    const bookable = sumCap(bookableOf, d.key)
    const over = sumCap(overOf, d.key)
    const unavailable = knownDepts.reduce((n, dept) => n + blockedOf(dept, d.key), 0)
    return {
      ...d, decked, open, bookable, over, unavailable,
      filled: dayFilled(d.key),
      pay: payByDay.get(d.key) ?? { CASH: 0, HMO: 0, GL: 0 },
      // Same formula as the board: booked ÷ (booked + open).
      fillPct: pct(decked, decked + open),
      runs: decked > 0 || bookable > 0,
    }
  })
  const weekOpen = perDay.reduce((n, d) => n + d.open, 0)
  const weekUnavailable = perDay.reduce((n, d) => n + d.unavailable, 0)
  const weekFillBase = weekTotal + weekOpen
  const runningDays = perDay.filter(d => d.runs)
  const busiestDay = weekTotal > 0
    ? perDay.reduce((best, d) => (d.decked > best.decked ? d : best), perDay[0])
    : null
  // Quietest of the days the branch actually runs — a closed Sunday is not
  // "quiet", it is shut.
  const quietestDay = runningDays.length > 1
    ? runningDays.reduce((low, d) => (d.decked < low.decked ? d : low), runningDays[0])
    : null
  const overDays = perDay.filter(d => d.over > 0)

  const deckedMax = Math.max(0, ...rows.flatMap(dept => DAYS.map(d => deckedOf(dept, d.key))))

  return (
    <div className="space-y-4">
      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard label="Decked this week" icon={<CalendarCheck size={15} />}
          value={weekTotal}
          sub={`${weekFilled} with a patient · ${rows.length} dept${rows.length === 1 ? '' : 's'}`} />
        <KpiCard label="Busiest day" icon={<TrendingUp size={15} />}
          value={busiestDay ? busiestDay.label : '—'}
          sub={busiestDay ? `${busiestDay.decked} decked` : 'nothing decked yet'} />
        <KpiCard label="Quietest day" icon={<TrendingDown size={15} />}
          value={quietestDay ? quietestDay.label : '—'}
          sub={quietestDay ? `${quietestDay.decked} decked` : 'needs two working days'} />
        <KpiCard label="Bookable hours filled" icon={<Gauge size={15} />}
          value={weekFillBase > 0 ? `${pct(weekTotal, weekFillBase)}%` : '—'}
          sub={weekFillBase > 0
            ? <>{weekTotal} of {weekFillBase}{weekUnavailable > 0 ? <> &middot; {weekUnavailable} unavailable excluded</> : null}</>
            : 'no bookable hours configured'} />
        <KpiCard label="Over-booked days" icon={<AlertTriangle size={15} />}
          accent={overDays.length > 0 ? WARN.fg : 'var(--teal)'}
          value={<span style={{ color: overDays.length > 0 ? WARN.fg : undefined }}>{overDays.length}</span>}
          sub={overDays.length > 0 ? overDays.map(d => d.short).join(', ') : 'none this week'} />
      </div>

      {/* ── Week strip ── */}
      <DashCard
        title={`Week at a glance — ${branchName}`}
        icon={<CalendarDays size={15} />}
        description="Decked sessions per day, how they are paid for, and how much of the bookable time they fill. Unavailable hours are not counted as bookable."
        action={weekTotal > 0 ? <PayLegend pay={payWeek} total={weekTotal} /> : undefined}
      >
        <ol className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5" aria-label="Decked sessions by day">
          {perDay.map(d => (
            <DayCard key={d.key} day={d} busiest={busiestDay?.key === d.key && d.decked > 0} />
          ))}
        </ol>
      </DashCard>

      {/* ── Decked per department per day ──
          An empty decked table is replaced, not the whole screen: capacity is
          still worth showing — arguably most worth showing — when nothing is
          booked yet. */}
      <DashCard
        flush
        title={`Decked sessions per day — ${branchName}`}
        icon={<CalendarCheck size={15} />}
        description={live.length === 0 ? undefined : (
          <>Every department&apos;s decked sessions, by day of week. <strong style={{ color: 'var(--charcoal)' }}>{weekTotal}</strong> per week across {rows.length} department{rows.length === 1 ? '' : 's'}. Letters under a count are its Cash / HMO / GL split.</>
        )}
      >
        {live.length === 0 ? (
          <EmptyState
            title={`No decked sessions in ${branchName}`}
            hint="Deck sessions under On-site, Teletherapy or Homecare and they will total up here." />
        ) : (
          <div style={SCROLL_BOX}>
            <table style={tableStyle}>
              <DayCols />
              <thead>
                <tr>
                  <th scope="col" style={TH_CORNER}>Department</th>
                  {DAYS.map(d => <th key={d.key} scope="col" title={d.label} style={TH_BASE}>{d.short}</th>)}
                  <th scope="col" style={TH_BASE}>Week</th>
                </tr>
              </thead>
              <tbody>
                {/* Totals sit at the TOP, above the per-department breakdown:
                    this is the number a daily target is set against, so it
                    should be the first thing read rather than a sum buried
                    under the table. */}
                <tr>
                  <th scope="row" style={{ ...TD_FIRST, background: TOTAL_BG, fontWeight: 700, color: 'var(--charcoal)' }}>
                    All departments
                  </th>
                  {perDay.map(d => (
                    <td key={d.key} style={{ ...TD_BASE, background: TOTAL_BG }}
                      title={d.decked > 0 ? `${d.label}: ${d.decked} decked, ${d.filled} booked` : undefined}>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: d.decked === 0 ? MUTED : 'var(--charcoal)' }}>
                        {d.decked === 0 ? '—' : d.decked}
                      </div>
                      {/* Booked vs decked: a target is about capacity, but
                          knowing how much of it is taken is the next question
                          every time. */}
                      {d.decked > 0 && (
                        <div style={{ fontSize: '0.64rem', color: 'var(--mid-gray)' }}>{d.filled} booked</div>
                      )}
                    </td>
                  ))}
                  <td style={{ ...TD_WEEK, background: TOTAL_BG, fontWeight: 800, fontSize: '0.95rem' }}>
                    {weekTotal}
                    <div style={{ fontSize: '0.64rem', color: 'var(--mid-gray)', fontWeight: 500 }}>{weekFilled} booked</div>
                  </td>
                </tr>

                {rows.map(dept => {
                  const row = countsByDept.get(dept)!
                  const filled = filledByDept.get(dept)!
                  const wk = DAYS.reduce((n, d) => n + (row.get(d.key) ?? 0), 0)
                  return (
                    <tr key={dept}>
                      <th scope="row" style={TD_FIRST}><DeptLabel dept={dept} /></th>
                      {DAYS.map(d => {
                        const n = row.get(d.key) ?? 0
                        const f = filled.get(d.key) ?? 0
                        return (
                          <td key={d.key} style={TD_BASE}
                            title={n > 0 ? `${dept} · ${d.label}: ${n} decked, ${f} booked` : undefined}>
                            {n === 0 ? <Zero /> : (
                              <div className="flex flex-col items-center gap-0.5">
                                <HeatChip n={n} max={deckedMax} />
                                {/* This department's payment mix for this day.
                                    Percentages are of this department's own
                                    count for the day, not of the day as a
                                    whole — the row is about this department,
                                    so mixing bases inside one cell would make
                                    both numbers untrustworthy. */}
                                <span className="flex gap-1" style={{ fontSize: '0.6rem', fontWeight: 700 }}>
                                  {PAYS.map(pt => {
                                    const c = payByDeptDay.get(dept)?.get(d.key)?.[pt] ?? 0
                                    if (c === 0) return null
                                    return (
                                      <span key={pt} style={{ color: PAY_UI[pt].fg }}
                                        title={`${dept} · ${d.label} · ${PAY_UI[pt].label}: ${c} of ${n} (${pct(c, n)}%)`}>
                                        {PAY_UI[pt].label[0]}{c}
                                      </span>
                                    )
                                  })}
                                </span>
                              </div>
                            )}
                          </td>
                        )
                      })}
                      <td style={TD_WEEK}>{wk}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>

      {/* ── Capacity ────────────────────────────────────────────────────────
          Two readings of the same week that the decked table cannot give: the
          time consultants actually left bookable, and what of it is still
          sellable. */}
      <CapacityTable
        title={`Bookable hours per day — ${branchName}`}
        blurb="The time a therapist or doctor gave us to consult — their configured work days and hours — minus the hours marked unavailable, whether or not anything is decked into them."
        depts={capacityDepts}
        valueOf={bookableOf}
        unavailableOf={blockedOf}
      />

      <CapacityTable
        title={`Open hours per day — ${branchName}`}
        blurb="Bookable hours minus what is already decked — what is still open to book. The percentage is open ÷ bookable."
        depts={capacityDepts}
        valueOf={availOf}
        outOf={bookableOf}
        overOf={overOf}
      />
    </div>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Zero() {
  return <span aria-label="none" style={{ color: MUTED }}>&mdash;</span>
}

function DeptLabel({ dept }: { dept: string }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0 max-w-full font-semibold" style={{ color: 'var(--charcoal)' }}>
      <span aria-hidden className="flex-shrink-0 rounded-full" style={{ width: 8, height: 8, background: deptColor(dept) }} />
      <span className="truncate" title={dept}>{dept}</span>
    </span>
  )
}

/** A number tinted on the shared teal ramp, relative to its table's largest cell. */
function HeatChip({ n, max, bold = true }: { n: number; max: number; bold?: boolean }) {
  const h = heatOf(n, max)
  return (
    <span className="inline-block rounded-md tabular-nums"
      style={{
        minWidth: 30, padding: '0.15rem 0.45rem', lineHeight: 1.35,
        background: h?.bg ?? 'transparent', color: h?.fg ?? 'var(--charcoal)',
        fontWeight: bold ? 700 : 600,
      }}>
      {n}
    </span>
  )
}

/** Week totals by payment, as a compact key for the strip below it. */
function PayLegend({ pay, total }: { pay: Record<Pay, number>; total: number }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Payment mix this week">
      {PAYS.map(t => (
        <li key={t} className="inline-flex items-center gap-1.5" title={`${PAY_UI[t].label}: ${pay[t]} of ${total} decked`}>
          <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: PAY_UI[t].bar }} />
          <span style={{ color: 'var(--charcoal)' }}>{PAY_UI[t].label}</span>
          <span className="font-bold tabular-nums" style={{ color: PAY_UI[t].fg }}>{pay[t]}</span>
          <span className="tabular-nums" style={{ color: 'var(--mid-gray)' }}>{pct(pay[t], total)}%</span>
        </li>
      ))}
    </ul>
  )
}

interface DaySummary {
  key: string; label: string; short: string
  decked: number; filled: number; open: number; bookable: number; over: number; unavailable: number
  pay: Record<Pay, number>; fillPct: number; runs: boolean
}

function DayCard({ day, busiest }: { day: DaySummary; busiest: boolean }) {
  const { decked, open, over, unavailable, pay, fillPct, runs } = day
  const border = over > 0 ? WARN.border : busiest ? '#9ED0D7' : 'var(--light-gray)'
  const bg = over > 0 ? '#FFFBFB' : busiest ? '#F3FAFB' : '#fff'
  return (
    <li className="rounded-xl px-3 py-3 min-w-0 flex flex-col gap-2" style={{ border: `1px solid ${border}`, background: bg }}>
      <div className="flex items-center justify-between gap-1 min-w-0">
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }} title={day.label}>
          {day.short}
        </span>
        {over > 0 ? (
          <Badge fg={WARN.fg} bg={WARN.bg} icon={<AlertTriangle size={10} />} title={`${over} more decked than the bookable hours on ${day.label}`}>
            +{over} over
          </Badge>
        ) : busiest ? (
          <Badge fg="#0F5C67" bg="#DCEFF2" icon={<TrendingUp size={10} />}>Busiest</Badge>
        ) : !runs ? (
          <Badge fg="var(--mid-gray)" bg="#F1F5F4">Closed</Badge>
        ) : null}
      </div>

      <div>
        <p className="text-2xl font-bold leading-none tabular-nums"
          style={{ fontFamily: 'var(--font-display)', color: decked === 0 ? MUTED : 'var(--charcoal)' }}>
          {decked}
        </p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>decked</p>
      </div>

      {/* Payment mix for the day, to scale. Shares are of THIS day, so a card
          can be read on its own without comparing totals. */}
      <div>
        <div className="flex overflow-hidden rounded-full" style={{ height: 6, background: RULE }}
          role="img" aria-label={decked > 0 ? PAYS.map(t => `${PAY_UI[t].label} ${pay[t]}`).join(', ') : 'nothing decked'}>
          {decked > 0 && PAYS.filter(t => pay[t] > 0).map(t => (
            <div key={t} title={`${PAY_UI[t].label}: ${pay[t]} (${pct(pay[t], decked)}%)`}
              style={{ width: `${(pay[t] / decked) * 100}%`, background: PAY_UI[t].bar }} />
          ))}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-1.5 text-[10px] font-semibold tabular-nums leading-tight" style={{ minHeight: '0.8rem' }}>
          {PAYS.filter(t => pay[t] > 0).map(t => (
            <span key={t} style={{ color: PAY_UI[t].fg }} title={`${PAY_UI[t].label}: ${pay[t]} (${pct(pay[t], decked)}%)`}>
              {PAY_UI[t].label[0]}{pay[t]}
            </span>
          ))}
        </div>
      </div>

      {/* Fill against the bookable hours only — booked ÷ (booked + open). */}
      <div className="mt-auto pt-2" style={{ borderTop: `1px solid ${RULE}` }}>
        {decked + open > 0 ? (
          <>
            <div className="flex items-baseline justify-between gap-1 text-[11px]">
              <span style={{ color: 'var(--mid-gray)' }}>Filled</span>
              <span className="font-bold tabular-nums" style={{ color: 'var(--charcoal)' }}>{fillPct}%</span>
            </div>
            <div className="mt-1 rounded-full overflow-hidden" style={{ height: 4, background: RULE }}
              role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fillPct} aria-label={`${day.label} filled`}>
              <div style={{ width: `${fillPct}%`, height: '100%', background: '#1A7B8A' }} />
            </div>
            <p className="mt-1 text-[10px] tabular-nums leading-tight" style={{ color: 'var(--mid-gray)' }}>
              {open} open{unavailable > 0 ? <> &middot; {unavailable} unavail.</> : null}
            </p>
          </>
        ) : (
          <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
            No bookable hours{unavailable > 0 ? <> &middot; {unavailable} unavail.</> : null}
          </p>
        )}
      </div>
    </li>
  )
}

function Badge({ children, fg, bg, icon, title }: { children: ReactNode; fg: string; bg: string; icon?: ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none whitespace-nowrap"
      style={{ color: fg, background: bg }}>
      {icon && <span aria-hidden className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  )
}

/** Over-booked marker for a table cell: words and an icon, not colour alone. */
function OverTag({ over, bold = false }: { over: number; bold?: boolean }) {
  return (
    <div className="inline-flex items-center gap-0.5 mt-0.5" style={{ fontSize: '0.64rem', color: WARN.fg, fontWeight: bold ? 800 : 700, lineHeight: 1.3 }}
      title={`${over} more decked than the bookable hours on this day`}>
      <AlertTriangle size={9} aria-hidden /> {over} over
    </div>
  )
}

function SubNote({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <div className="tabular-nums mt-0.5" style={{ fontSize: '0.64rem', color: strong ? '#64748B' : '#94A3B8', fontWeight: strong ? 700 : 500, lineHeight: 1.3 }}>
      {children}
    </div>
  )
}

/**
 * One department × day grid over a single number.
 *
 * Both capacity tables share it rather than being written twice: they differ
 * only in which number each cell holds, and two hand-copied grids would be two
 * places for a day-order or totals bug to appear in.
 */
function CapacityTable({
  title, blurb, depts, valueOf, outOf, overOf, unavailableOf,
}: {
  title: string
  blurb: string
  depts: string[]
  valueOf: (dept: string, day: string) => number
  /** Hours decked beyond what was bookable, shown instead of a bare zero. */
  overOf?: (dept: string, day: string) => number
  /**
   * Denominator for the percentage under each cell. Given for the open table
   * so a number can be read as a share — 6 open slots means something
   * different out of 8 than out of 80 — and omitted for the bookable table,
   * where a percentage of itself would always be 100%.
   */
  outOf?: (dept: string, day: string) => number
  /** Hours marked unavailable, shown as a muted count beside the value. */
  unavailableOf?: (dept: string, day: string) => number
}) {
  const dayTotal = (day: string) => depts.reduce((n, d) => n + valueOf(d, day), 0)
  const weekTotal = DAYS.reduce((n, d) => n + dayTotal(d.key), 0)
  const max = Math.max(0, ...depts.flatMap(dept => DAYS.map(d => valueOf(dept, d.key))))
  const unavail = (dept: string, day: string) => unavailableOf?.(dept, day) ?? 0

  if (depts.length === 0) {
    return (
      <DashCard title={title}>
        <EmptyState
          title="No capacity to total yet"
          hint="No consultant has work days configured at this branch yet, so there is no capacity to total." />
      </DashCard>
    )
  }

  const weekUnavail = unavailableOf
    ? depts.reduce((t, dept) => t + DAYS.reduce((x, d) => x + unavail(dept, d.key), 0), 0)
    : 0

  return (
    <DashCard
      flush
      title={title}
      icon={<CalendarDays size={15} />}
      description={<>{blurb} <strong style={{ color: 'var(--charcoal)' }}>{weekTotal}</strong> per week{weekUnavail > 0 ? <> &middot; {weekUnavail} unavailable, not counted</> : null}.</>}
    >
      <div style={SCROLL_BOX}>
        <table style={tableStyle}>
          <DayCols />
          <thead>
            <tr>
              <th scope="col" style={TH_CORNER}>Department</th>
              {DAYS.map(d => <th key={d.key} scope="col" title={d.label} style={TH_BASE}>{d.short}</th>)}
              <th scope="col" style={TH_BASE}>Week</th>
            </tr>
          </thead>
          <tbody>
            {depts.map(dept => {
              const wk = DAYS.reduce((n, d) => n + valueOf(dept, d.key), 0)
              const wkUnavail = DAYS.reduce((n, d) => n + unavail(dept, d.key), 0)
              return (
                <tr key={dept}>
                  <th scope="row" style={TD_FIRST}><DeptLabel dept={dept} /></th>
                  {DAYS.map(d => {
                    const n = valueOf(dept, d.key)
                    const base = outOf?.(dept, d.key) ?? 0
                    const over = overOf?.(dept, d.key) ?? 0
                    const u = unavail(dept, d.key)
                    return (
                      <td key={d.key} style={TD_BASE}>
                        {n === 0 && base === 0 && !over && !u ? <Zero /> : n === 0 ? (
                          <span className="tabular-nums" style={{ color: '#94A3B8', fontWeight: 600 }}>0</span>
                        ) : (
                          <HeatChip n={n} max={max} />
                        )}
                        {/* Over-booked days say so. A floored 0 with "0%" reads
                            as "full", which is a different situation. */}
                        {over > 0 ? (
                          <div><OverTag over={over} /></div>
                        ) : outOf && base > 0 ? (
                          /* No percentage when nothing was bookable that day —
                             0 of 0 is not 0%, it is "the clinic was shut". */
                          <SubNote>{pct(n, base)}%</SubNote>
                        ) : null}
                        {u > 0 && <SubNote>{u} unavail.</SubNote>}
                      </td>
                    )
                  })}
                  <td style={TD_WEEK}>
                    {wk}
                    {outOf && (() => {
                      const wkBase = DAYS.reduce((t, d) => t + (outOf(dept, d.key) ?? 0), 0)
                      return wkBase > 0 ? <SubNote>{pct(wk, wkBase)}%</SubNote> : null
                    })()}
                    {wkUnavail > 0 && <SubNote>{wkUnavail} unavail.</SubNote>}
                  </td>
                </tr>
              )
            })}
            <tr>
              <th scope="row" style={{ ...TD_FIRST, background: TOTAL_BG, fontWeight: 800, color: 'var(--charcoal)', borderBottom: 'none' }}>
                All departments
              </th>
              {DAYS.map(d => {
                const n = dayTotal(d.key)
                const base = outOf ? depts.reduce((t, dept) => t + outOf(dept, d.key), 0) : 0
                // The totals row carries the overage too. Without it a day could
                // read 0% here while a department beneath it says "2 over",
                // which looks like the table contradicting itself.
                const over = overOf ? depts.reduce((t, dept) => t + overOf(dept, d.key), 0) : 0
                const u = depts.reduce((t, dept) => t + unavail(dept, d.key), 0)
                return (
                  <td key={d.key} style={{ ...TD_BASE, background: TOTAL_BG, fontWeight: 800, color: n === 0 ? MUTED : 'var(--charcoal)', borderBottom: 'none' }}>
                    {n === 0 && base === 0 && !over && !u ? '—' : n}
                    {over > 0 ? (
                      <div><OverTag over={over} bold /></div>
                    ) : outOf && base > 0 ? (
                      <SubNote strong>{pct(n, base)}%</SubNote>
                    ) : null}
                    {u > 0 && <SubNote>{u} unavail.</SubNote>}
                  </td>
                )
              })}
              <td style={{ ...TD_WEEK, background: TOTAL_BG, fontWeight: 800, borderBottom: 'none' }}>
                {weekTotal}
                {outOf && (() => {
                  const wkBase = depts.reduce((t, dept) => t + DAYS.reduce((x, d) => x + outOf(dept, d.key), 0), 0)
                  return wkBase > 0 ? <SubNote strong>{pct(weekTotal, wkBase)}%</SubNote> : null
                })()}
                {weekUnavail > 0 && <SubNote>{weekUnavail} unavail.</SubNote>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DashCard>
  )
}

/** Placeholder for the Per Day tab while the branch's board loads. */
export function PerDaySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading the per-day view">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" aria-hidden>
        {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[78px] rounded-xl" />)}
      </div>
      <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid var(--light-gray)' }} aria-hidden>
        <Skeleton className="h-4 mb-4" style={{ width: 220 }} />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {DAYS.map(d => <Skeleton key={d.key} className="h-[168px] rounded-xl" />)}
        </div>
      </div>
      {[0, 1].map(i => (
        <div key={i} className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid var(--light-gray)' }} aria-hidden>
          <Skeleton className="h-4 mb-4" style={{ width: 260 }} />
          <Skeleton className="h-40" />
        </div>
      ))}
    </div>
  )
}
