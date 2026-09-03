'use client'

// Decking Per Day — the whole week on one screen, so a daily session target can
// be set against what is actually decked.
//
// The other Decking sections answer "what does this consultant's week look
// like"; this one answers "how many sessions does this branch run on a Tuesday".
// That is a different cut of the same DeckingSlot rows: every department at
// once, grouped by day rather than by person.

import { deptColor } from '@/lib/dept-colors'

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
const PAY_UI: Record<Pay, { label: string; fg: string; bg: string }> = {
  CASH: { label: 'Cash', fg: '#14507F', bg: '#E3EEFB' },
  HMO:  { label: 'HMO',  fg: '#5B2A86', bg: '#EFE4FA' },
  GL:   { label: 'GL',   fg: '#93460B', bg: '#FDEAD6' },
}
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

  // Hours switched off. Subtracted from available alongside decked sessions, so
  // this screen and the Slots card on the boards give the same answer — Open
  // there is likewise total − booked − blocked.
  const blockedByDept = new Map<string, Map<string, number>>()
  for (const s of slots.filter(x => x.disabled)) {
    if (!blockedByDept.has(s.department)) blockedByDept.set(s.department, new Map())
    const m = blockedByDept.get(s.department)!
    m.set(s.dayOfWeek, (m.get(s.dayOfWeek) ?? 0) + 1)
  }

  // Departments with capacity but nothing decked still belong on the capacity
  // tables — an empty department is exactly what a cross-sell conversation
  // needs to see.
  const capacityDepts = departments.filter(d => capacity[d] && Object.keys(capacity[d]).length > 0)
  const capOf = (dept: string, day: string) => capacity[dept]?.[day] ?? 0
  const deckedOf = (dept: string, day: string) => countsByDept.get(dept)?.get(day) ?? 0
  const blockedOf = (dept: string, day: string) => blockedByDept.get(dept)?.get(day) ?? 0
  // Floored at zero: more decked than capacity means the config was narrowed
  // after the sessions were booked, and a negative "available" would read as a
  // data error rather than the over-booking it is.
  const availOf = (dept: string, day: string) =>
    Math.max(0, capOf(dept, day) - deckedOf(dept, day) - blockedOf(dept, day))

  const rows = departments.filter(d => countsByDept.has(d))
  const dayTotal = (day: string) =>
    rows.reduce((n, d) => n + (countsByDept.get(d)?.get(day) ?? 0), 0)
  const dayFilled = (day: string) =>
    rows.reduce((n, d) => n + (filledByDept.get(d)?.get(day) ?? 0), 0)
  const weekTotal = DAYS.reduce((n, d) => n + dayTotal(d.key), 0)
  const busiest = Math.max(1, ...DAYS.map(d => dayTotal(d.key)))

  const cellBase: React.CSSProperties = {
    padding: '0.5rem 0.4rem', textAlign: 'center', fontSize: '0.82rem',
    borderBottom: '1px solid #F1F5F9',
  }

  // An empty decked table is replaced, not the whole screen: capacity is still
  // worth showing — arguably most worth showing — when nothing is booked yet.
  if (live.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ background: '#fff', border: '1px solid var(--light-gray)', borderRadius: '0.75rem', padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--charcoal)', fontWeight: 600, fontSize: '0.875rem' }}>
            No decked sessions in {branchName}
          </p>
          <p style={{ color: 'var(--mid-gray)', fontSize: '0.8rem', marginTop: '0.35rem' }}>
            Deck sessions under On-site, Teletherapy or Homecare and they will total up here.
          </p>
        </div>
        <CapacityTable
          title={`Slots per day — ${branchName}`}
          blurb="All the time a therapist or doctor gave us to consult, by day of week — their configured work days and hours, whether or not anything is decked into them."
          depts={capacityDepts} valueOf={capOf} accent="#1F2937" cellBase={cellBase}
        />
        <CapacityTable
          title={`Available slots per day — ${branchName}`}
          blurb="Slots the consultants gave us, minus what is already decked and minus the hours marked unavailable — what is still open to book."
          depts={capacityDepts} valueOf={availOf} accent="#166534" cellBase={cellBase} emphasiseZero
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
    <div style={{ background: '#fff', border: '1px solid var(--light-gray)', borderRadius: '0.75rem', overflow: 'hidden' }}>
      <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--light-gray)' }}>
        <p style={{ fontWeight: 700, color: 'var(--charcoal)', fontSize: '0.9rem' }}>
          Decking per day &mdash; {branchName}
        </p>
        <p style={{ color: 'var(--mid-gray)', fontSize: '0.78rem', marginTop: '0.15rem' }}>
          Every department&apos;s decked sessions, by day of week.{' '}
          <strong>{weekTotal}</strong> per week across {rows.length} department{rows.length === 1 ? '' : 's'}.
        </p>
      </div>

      {/* Week totals. Decked is shown against ALL bookable slots, so the headline
          number answers "how full is the week" rather than restating itself as
          100%. The three payment lines are percentages OF THE DECKED SESSIONS —
          the base is named on each so the two kinds of percentage on this screen
          can't be read as the same thing. */}
      {(() => {
        const bookable = slots.filter(s => !s.disabled).length
        const cards: { label: string; value: number; sub: string; fg: string; bg: string }[] = [
          {
            label: 'Sessions decked this week',
            value: weekTotal,
            sub: `${pct(weekTotal, bookable)}% of ${bookable} bookable slots`,
            fg: '#065F46', bg: '#ECFDF5',
          },
          ...PAYS.map(t => ({
            label: `${PAY_UI[t].label} sessions`,
            value: payWeek[t],
            sub: `${pct(payWeek[t], weekTotal)}% of decked`,
            fg: PAY_UI[t].fg, bg: PAY_UI[t].bg,
          })),
        ]
        return (
          <div style={{
            display: 'grid', gap: '0.6rem', padding: '0.9rem 1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            borderBottom: '1px solid var(--light-gray)',
          }}>
            {cards.map(c => (
              <div key={c.label} style={{ background: c.bg, borderRadius: '0.6rem', padding: '0.6rem 0.75rem' }}>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: c.fg, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                  {c.value}
                </div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: c.fg, marginTop: 1 }}>{c.label}</div>
                <div style={{ fontSize: '0.68rem', color: c.fg, opacity: 0.75, marginTop: 1 }}>{c.sub}</div>
              </div>
            ))}
          </div>
        )
      })()}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              <th style={{ ...cellBase, textAlign: 'left', padding: '0.55rem 1rem', color: 'var(--mid-gray)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Department
              </th>
              {DAYS.map(d => (
                <th key={d.key} title={d.label}
                  style={{ ...cellBase, color: 'var(--mid-gray)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {d.short}
                </th>
              ))}
              <th style={{ ...cellBase, color: 'var(--mid-gray)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Week
              </th>
            </tr>

            {/* Totals sit at the TOP, above the per-department breakdown: this is
                the number a daily target is set against, so it should be the
                first thing read rather than a sum buried under the table. */}
            <tr style={{ background: '#ECFDF5' }}>
              <th style={{ ...cellBase, textAlign: 'left', padding: '0.6rem 1rem', color: 'var(--charcoal)', fontSize: '0.78rem', fontWeight: 700 }}>
                Total sessions
              </th>
              {DAYS.map(d => {
                const t = dayTotal(d.key)
                const f = dayFilled(d.key)
                return (
                  <th key={d.key} style={{ ...cellBase, padding: '0.5rem 0.4rem' }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: t === 0 ? '#CBD5E1' : '#065F46', lineHeight: 1.1 }}>
                      {t}
                    </div>
                    {/* Booked vs decked: a target is about capacity, but knowing
                        how much of it is taken is the next question every time. */}
                    {t > 0 && (
                      <div style={{ fontSize: '0.66rem', color: 'var(--mid-gray)', fontWeight: 500 }}>
                        {f} booked
                      </div>
                    )}
                    {/* Bar makes the shape of the week readable at a glance —
                        which days are light is the point of the exercise. */}
                    <div style={{ height: 3, marginTop: 3, background: '#D1FAE5', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${(t / busiest) * 100}%`, background: '#059669', borderRadius: 2 }} />
                    </div>
                    {/* Payment mix for the day. Percentages are of THIS day, so
                        a column can be read on its own without comparing totals. */}
                    {t > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 4, fontWeight: 600 }}>
                        {PAYS.map(pt => {
                          const n = payByDay.get(d.key)?.[pt] ?? 0
                          if (n === 0) return null
                          return (
                            <div key={pt} style={{ fontSize: '0.62rem', color: PAY_UI[pt].fg, display: 'flex', justifyContent: 'center', gap: 3 }}>
                              <span>{PAY_UI[pt].label}</span>
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                              <span style={{ opacity: 0.7 }}>({pct(n, t)}%)</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </th>
                )
              })}
              <th style={{ ...cellBase, fontSize: '1.15rem', fontWeight: 800, color: '#065F46' }}>
                {weekTotal}
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map(dept => {
              const row = countsByDept.get(dept)!
              const filled = filledByDept.get(dept)!
              const wk = DAYS.reduce((n, d) => n + (row.get(d.key) ?? 0), 0)
              return (
                <tr key={dept}>
                  <td style={{ ...cellBase, textAlign: 'left', padding: '0.5rem 1rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600, color: 'var(--charcoal)' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: deptColor(dept), flexShrink: 0 }} />
                      {dept}
                    </span>
                  </td>
                  {DAYS.map(d => {
                    const n = row.get(d.key) ?? 0
                    const f = filled.get(d.key) ?? 0
                    return (
                      <td key={d.key} style={cellBase}
                        title={n > 0 ? `${dept} · ${DAYS.find(x => x.key === d.key)!.label}: ${n} decked, ${f} booked` : undefined}>
                        {n === 0 ? (
                          <span style={{ color: '#E2E8F0' }}>&mdash;</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <span style={{
                              display: 'inline-block', minWidth: 26, padding: '0.15rem 0.4rem', borderRadius: '0.35rem',
                              // Department colour at low opacity so the number stays
                              // legible; the chip carries the identity, not the text.
                              background: `${deptColor(dept)}1A`,
                              color: deptColor(dept), fontWeight: 700,
                            }}>
                              {n}
                            </span>
                            {/* This department's payment mix for this day.
                                Percentages are of this department's own count for
                                the day, not of the day as a whole — the row is
                                about this department, so mixing bases inside one
                                cell would make both numbers untrustworthy. */}
                            <span style={{ display: 'flex', gap: 3, fontSize: '0.6rem', fontWeight: 700 }}>
                              {PAYS.map(pt => {
                                const c = payByDeptDay.get(dept)?.get(d.key)?.[pt] ?? 0
                                if (c === 0) return null
                                return (
                                  <span key={pt} style={{ color: PAY_UI[pt].fg }}
                                    title={`${dept} · ${DAYS.find(x => x.key === d.key)!.label} · ${PAY_UI[pt].label}: ${c} of ${n} (${pct(c, n)}%)`}>
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
                  <td style={{ ...cellBase, fontWeight: 700, color: 'var(--charcoal)' }}>{wk}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>

    {/* ── Capacity ────────────────────────────────────────────────────────
        Two readings of the same week that the decked table cannot give: the
        time consultants actually gave us, and what of it is still sellable. */}
    <CapacityTable
      title={`Slots per day — ${branchName}`}
      blurb="All the time a therapist or doctor gave us to consult, by day of week — their configured work days and hours, whether or not anything is decked into them."
      depts={capacityDepts}
      valueOf={capOf}
      accent="#1F2937"
      cellBase={cellBase}
    />

    <CapacityTable
      title={`Available slots per day — ${branchName}`}
      blurb="Slots the consultants gave us, minus what is already decked and minus the hours marked unavailable — what is still open to book."
      depts={capacityDepts}
      valueOf={availOf}
      accent="#166534"
      cellBase={cellBase}
      emphasiseZero
    />
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
  title, blurb, depts, valueOf, accent, cellBase, emphasiseZero = false,
}: {
  title: string
  blurb: string
  depts: string[]
  valueOf: (dept: string, day: string) => number
  accent: string
  cellBase: React.CSSProperties
  emphasiseZero?: boolean
}) {
  const dayTotal = (day: string) => depts.reduce((n, d) => n + valueOf(d, day), 0)
  const weekTotal = DAYS.reduce((n, d) => n + dayTotal(d.key), 0)

  if (depts.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid var(--light-gray)', borderRadius: '0.75rem', padding: '1.5rem', textAlign: 'center' }}>
        <p style={{ fontWeight: 700, color: 'var(--charcoal)', fontSize: '0.9rem' }}>{title}</p>
        <p style={{ color: 'var(--mid-gray)', fontSize: '0.8rem', marginTop: '0.35rem' }}>
          No consultant has work days configured at this branch yet, so there is no capacity to total.
        </p>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--light-gray)', borderRadius: '0.75rem', overflow: 'hidden' }}>
      <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--light-gray)' }}>
        <p style={{ fontWeight: 700, color: 'var(--charcoal)', fontSize: '0.9rem' }}>{title}</p>
        <p style={{ color: 'var(--mid-gray)', fontSize: '0.78rem', marginTop: '0.15rem' }}>
          {blurb} <strong>{weekTotal}</strong> per week.
        </p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--mid-gray)', borderBottom: '1px solid #E2E8F0' }}>Department</th>
              {DAYS.map(d => (
                <th key={d.key} style={{ padding: '0.5rem 0.4rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--mid-gray)', borderBottom: '1px solid #E2E8F0' }}>{d.short}</th>
              ))}
              <th style={{ padding: '0.5rem 0.4rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--mid-gray)', borderBottom: '1px solid #E2E8F0' }}>Week</th>
            </tr>
          </thead>
          <tbody>
            {depts.map(dept => {
              const wk = DAYS.reduce((n, d) => n + valueOf(dept, d.key), 0)
              return (
                <tr key={dept}>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--charcoal)', borderBottom: '1px solid #F1F5F9' }}>{dept}</td>
                  {DAYS.map(d => {
                    const n = valueOf(dept, d.key)
                    return (
                      <td key={d.key} style={{
                        ...cellBase,
                        color: n === 0 ? '#CBD5E1' : accent,
                        fontWeight: n > 0 && emphasiseZero ? 700 : 500,
                      }}>
                        {n === 0 ? '·' : n}
                      </td>
                    )
                  })}
                  <td style={{ ...cellBase, fontWeight: 700, color: 'var(--charcoal)' }}>{wk}</td>
                </tr>
              )
            })}
            <tr style={{ background: '#F8FAFC' }}>
              <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem', fontWeight: 800, color: 'var(--charcoal)' }}>All departments</td>
              {DAYS.map(d => (
                <td key={d.key} style={{ ...cellBase, fontWeight: 800, color: accent }}>{dayTotal(d.key) || '·'}</td>
              ))}
              <td style={{ ...cellBase, fontWeight: 800, color: 'var(--charcoal)' }}>{weekTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
