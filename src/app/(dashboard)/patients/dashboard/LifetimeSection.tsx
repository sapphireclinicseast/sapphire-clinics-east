'use client'

// "Patient Lifetime by Service" — how long patients stay with each department,
// measured from their first recorded session to their last. Sits directly below
// "Patients by Service", which counts the same patients this section measures.

import { useState, useEffect, useCallback } from 'react'
import { Hourglass } from 'lucide-react'

interface DeptRow {
  dept: string
  patients: number
  singleDay: number
  avgDaysAll: number | null
  avgDaysRepeat: number | null
  medianDays: number | null
}

interface Data {
  window: { from: string | null; to: string | null }
  posSpansMerged: number
  posOnlyPatients: number
  overall: Omit<DeptRow, 'dept'>
  departments: DeptRow[]
}

function monthYear(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
}

// Friendly labels — the DB stores the enum name. Same mapping as the
// "Patients by Service" section so a department reads identically in both.
const DEPT_LABELS: Record<string, string> = {
  PT: 'Physical Therapy',
  OT: 'Occupational Therapy',
  SLP: 'Speech & Language',
  MD: 'Medicine',
  PSYCHOLOGY: 'Psychology',
  ORTHOSIS: 'Orthosis & Prosthesis',
  SPED: 'Special Education',
}

const DEPT_COLORS: Record<string, string> = {
  PT: '#2AAABB',
  OT: '#1A7B8A',
  SLP: '#F59E0B',
  MD: '#DC2626',
  PSYCHOLOGY: '#7C3AED',
  ORTHOSIS: '#0E7490',
  SPED: '#8B5CF6',
}

// What each figure column means, in the order they appear. Written out because
// "Repeat only" and "Median" are statistics vocabulary, not clinic vocabulary,
// and a column of numbers gives no clue which are days and which are people.
const COLUMNS: { label: string; unit: string; width: number; help: string }[] = [
  {
    label: 'Average',
    unit: 'days',
    width: 96,
    help:
      'Average lifetime in days across every patient this service has seen — ' +
      'first contact to last. Patients seen on a single day count as zero, ' +
      'which is what pulls this figure below the Repeat only column.',
  },
  {
    label: 'Repeat only',
    unit: 'days',
    width: 80,
    help:
      'The same average, in days, counting only patients who came back on a ' +
      'later day. Single-day patients are left out, so this is how long ' +
      'someone stays once they actually begin a course of treatment.',
  },
  {
    label: 'Median',
    unit: 'days',
    width: 68,
    help:
      'The middle patient, in days: half of this service’s patients have a ' +
      'shorter lifetime and half longer. A handful of very long-staying ' +
      'patients drag the Average up but barely move the Median, so a large ' +
      'gap between the two means the Average is not typical.',
  },
  {
    label: 'Single day',
    unit: 'patients',
    width: 86,
    help:
      'How many patients had their first and last contact on the same day, ' +
      'and what share of the service that is. This is a count of people, not ' +
      'days. Their lifetime is genuinely zero — a one-off consult rather ' +
      'than a course of treatment.',
  },
]

/** Days are the unit the figure is computed in; months are the unit a clinic
 *  manager thinks in. Both are shown rather than picking one. */
function days(d: number | null): string {
  return d === null ? '—' : `${d.toLocaleString()} d`
}

function months(d: number | null): string {
  if (d === null || d < 45) return ''
  return `${(d / 30.44).toFixed(1)} mo`
}

export default function LifetimeSection({ branches }: { branches: string[] }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback((brs: string[]) => {
    setLoading(true)
    const qs = new URLSearchParams({ branches: brs.join(','), _t: String(Date.now()) })
    fetch(`/api/patients/lifetime-by-dept?${qs}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Data | null) => { if (d) setData(d) })
      .catch(() => { /* never break the dashboard over this panel */ })
      .finally(() => setLoading(false))
  }, [])

  const key = branches.join(',')
  useEffect(() => {
    load(branches)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const rows = data?.departments ?? []
  // Scaled against the longest-staying department rather than the total, the
  // same way the Patients by Service bars are scaled.
  const max = Math.max(1, ...rows.map((r) => r.avgDaysAll ?? 0))

  return (
    <div className="rounded-xl" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
      <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
        <div className="flex items-center gap-2">
          <Hourglass size={14} style={{ color: 'var(--teal)' }} />
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>
            Patient Lifetime by Service
          </p>
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
          How long patients stay with each department — from first contact to last.
          Combines Clinic Schedule sessions with POS billing history, so treatment from
          before a department used the schedule still counts. Measured within each
          department, so a patient receiving two services contributes a separate span
          to each.
        </p>
        {data && (
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--mid-gray)' }}>
            Across <strong>{data.overall.patients.toLocaleString()}</strong> patients with
            confirmed sessions
            {data.window.from ? ` between ${monthYear(data.window.from)} and ${monthYear(data.window.to)}` : ''},
            the average is <strong>{days(data.overall.avgDaysAll)}</strong> (median{' '}
            {days(data.overall.medianDays)}).{' '}
            <span title="First and last contact on the same day, so the lifetime is genuinely zero — a one-off consult rather than a course of treatment. These are counted in the Average column and excluded from Repeat only.">
              <strong>{data.overall.singleDay.toLocaleString()}</strong> of them
              ({Math.round((data.overall.singleDay / Math.max(1, data.overall.patients)) * 100)}%)
              came just the once, which is what pulls the average below the repeat-patient figure.
            </span>
          </p>
        )}
      </div>

      {loading && !data ? (
        <div className="py-14 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
          Loading lifetime breakdown…
        </div>
      ) : rows.length === 0 || data?.overall.patients === 0 ? (
        <div className="py-14 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
          No confirmed sessions for the selected branches yet.
        </div>
      ) : (
        <div className="p-5">
          {/* Column headings. Three of these are durations and one is a head
              count, which is not something a reader can work out from four
              right-aligned numbers — so each says its unit and carries a fuller
              explanation on hover. The dotted underline and help cursor are
              what tell anyone the hover exists. */}
          <div className="flex items-center gap-3 pb-2 mb-1" style={{ borderBottom: '1px solid var(--light-gray)' }}>
            <div className="flex-shrink-0" style={{ width: 150 }} />
            <div className="flex-1" />
            {COLUMNS.map((c) => (
              <div
                key={c.label}
                className="flex-shrink-0 text-right text-[10px] font-semibold uppercase tracking-wider"
                style={{ width: c.width, color: 'var(--mid-gray)' }}
              >
                <span
                  title={c.help}
                  style={{
                    cursor: 'help',
                    borderBottom: '1px dotted var(--mid-gray)',
                    paddingBottom: 1,
                  }}
                >
                  {c.label}
                </span>
                <span className="block font-normal tracking-normal" style={{ fontSize: 9, opacity: 0.75 }}>
                  {c.unit}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2.5 pt-1.5">
            {rows.map((r) => {
              const c = DEPT_COLORS[r.dept] ?? '#9CA3AF'
              const barPct = ((r.avgDaysAll ?? 0) / max) * 100
              const onePct = r.patients > 0 ? Math.round((r.singleDay / r.patients) * 100) : 0
              return (
                <div key={r.dept} className="flex items-center gap-3">
                  <div className="flex-shrink-0" style={{ width: 150 }}>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5"
                      style={{ background: `${c}18`, color: c }}>
                      {r.dept}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                      {DEPT_LABELS[r.dept] ?? r.dept}
                    </span>
                  </div>

                  <div className="flex-1 rounded-full overflow-hidden" style={{ height: 22, background: '#F3F4F6' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${barPct}%`, background: c, minWidth: (r.avgDaysAll ?? 0) > 0 ? 2 : 0 }}
                    />
                  </div>

                  {/* Average across every patient — the headline figure */}
                  <div className="flex-shrink-0 text-right" style={{ width: 96 }}>
                    <span className="text-sm font-bold" style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                      {days(r.avgDaysAll)}
                    </span>
                    {months(r.avgDaysAll) && (
                      <span className="text-[10px] ml-1" style={{ color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums' }}>
                        {months(r.avgDaysAll)}
                      </span>
                    )}
                  </div>

                  {/* Same average with one-visit patients removed */}
                  <div className="flex-shrink-0 text-right" style={{ width: 80 }}>
                    <span className="text-xs" style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                      {days(r.avgDaysRepeat)}
                    </span>
                  </div>

                  <div className="flex-shrink-0 text-right" style={{ width: 68 }}>
                    <span className="text-xs" style={{ color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums' }}>
                      {days(r.medianDays)}
                    </span>
                  </div>

                  <div className="flex-shrink-0 text-right" style={{ width: 86 }}>
                    <span className="text-xs" style={{ color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums' }}>
                      {r.patients > 0 ? `${r.singleDay.toLocaleString()} · ${onePct}%` : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
