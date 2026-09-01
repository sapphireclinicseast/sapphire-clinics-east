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
const DAYS: { key: string; label: string; short: string }[] = [
  { key: 'SUN', label: 'Sunday',    short: 'Sun' },
  { key: 'MON', label: 'Monday',    short: 'Mon' },
  { key: 'TUE', label: 'Tuesday',   short: 'Tue' },
  { key: 'WED', label: 'Wednesday', short: 'Wed' },
  { key: 'THU', label: 'Thursday',  short: 'Thu' },
  { key: 'FRI', label: 'Friday',    short: 'Fri' },
  { key: 'SAT', label: 'Saturday',  short: 'Sat' },
]

export interface PerDaySlot {
  dayOfWeek: string
  department: string
  disabled: boolean
  patientId: string | null
}

export default function DeckingPerDay({
  slots, departments, branchName,
}: {
  slots: PerDaySlot[]
  departments: string[]
  branchName: string
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
  const rows = departments.filter(d => countsByDept.has(d))
  const dayTotal = (day: string) =>
    rows.reduce((n, d) => n + (countsByDept.get(d)?.get(day) ?? 0), 0)
  const dayFilled = (day: string) =>
    rows.reduce((n, d) => n + (filledByDept.get(d)?.get(day) ?? 0), 0)
  const weekTotal = DAYS.reduce((n, d) => n + dayTotal(d.key), 0)
  const busiest = Math.max(1, ...DAYS.map(d => dayTotal(d.key)))

  if (live.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid var(--light-gray)', borderRadius: '0.75rem', padding: '3rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--charcoal)', fontWeight: 600, fontSize: '0.875rem' }}>
          No decked sessions in {branchName}
        </p>
        <p style={{ color: 'var(--mid-gray)', fontSize: '0.8rem', marginTop: '0.35rem' }}>
          Deck sessions under On-site, Teletherapy or Homecare and they will total up here.
        </p>
      </div>
    )
  }

  const cellBase: React.CSSProperties = {
    padding: '0.5rem 0.4rem', textAlign: 'center', fontSize: '0.82rem',
    borderBottom: '1px solid #F1F5F9',
  }

  return (
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
                          <span style={{
                            display: 'inline-block', minWidth: 26, padding: '0.15rem 0.4rem', borderRadius: '0.35rem',
                            // Department colour at low opacity so the number stays
                            // legible; the chip carries the identity, not the text.
                            background: `${deptColor(dept)}1A`,
                            color: deptColor(dept), fontWeight: 700,
                          }}>
                            {n}
                          </span>
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
  )
}
