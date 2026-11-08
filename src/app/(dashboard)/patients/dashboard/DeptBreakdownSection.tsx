'use client'

// "Patients by Service" — unique patients receiving each department's service,
// from confirmed sessions. Sits immediately above the Interdepartmental
// Service Co-occurrence section, which explains the overlap between these
// counts.

import { useState, useEffect, useCallback } from 'react'
import { Activity } from 'lucide-react'
import { DashCard, BarListSkeleton, EmptyState, DeptChip } from './ui'

interface DeptRow {
  dept: string
  count: number
  pct: number
}

interface Data {
  totalPatients: number
  totalRoster: number
  sessionWindow: { from: string | null; to: string | null }
  match?: { byId: number; byName: number; unmatched: number; ambiguous: number }
  departments: DeptRow[]
}

function monthYear(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
}

// Friendly labels — the DB stores the enum name. Matches the convention used
// in the aurora-admin and patient-portal routes.
const DEPT_LABELS: Record<string, string> = {
  PT: 'Physical Therapy',
  OT: 'Occupational Therapy',
  SLP: 'Speech & Language',
  MD: 'Medicine',
  PSYCHOLOGY: 'Psychology',
  ORTHOSIS: 'Orthosis & Prosthesis',
  SPED: 'Special Education',
}

// OT/PT/SLP/SPED reuse the colours already used by the interdepartmental
// section so the same department reads the same colour across the page.
const DEPT_COLORS: Record<string, string> = {
  PT: '#2AAABB',
  OT: '#1A7B8A',
  SLP: '#F59E0B',
  MD: '#DC2626',
  PSYCHOLOGY: '#7C3AED',
  ORTHOSIS: '#0E7490',
  SPED: '#8B5CF6',
}

export default function DeptBreakdownSection({ branches }: { branches: string[] }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback((brs: string[]) => {
    setLoading(true)
    const qs = new URLSearchParams({ branches: brs.join(','), _t: String(Date.now()) })
    fetch(`/api/patients/dept-breakdown?${qs}`, { cache: 'no-store' })
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
  // Scale bars against the largest department, not the total — with overlapping
  // services the largest is a far more readable reference.
  const max = Math.max(1, ...rows.map((r) => r.count))

  return (
    <DashCard
      title="Patients by Service"
      icon={<Activity size={15} />}
      description="Unique patients with confirmed sessions per department. A patient receiving two services is counted in both, so these add up to more than the total."
      footer={data ? (
        <>
          Based on <strong>{data.totalPatients.toLocaleString()}</strong> patients with recorded
          treatment{data.sessionWindow.from ? ` between ${monthYear(data.sessionWindow.from)} and ${monthYear(data.sessionWindow.to)}` : ''}
          {' '}— percentages are of that figure, not of the{' '}
          <strong>{data.totalRoster.toLocaleString()}</strong>-patient roster. Combines Clinic
          Schedule sessions with POS billing history, so visits from before this hub was in use
          are included.
          {data.match && (data.match.unmatched + data.match.ambiguous) > 0 && (
            <>
              {' '}
              <span title="Historical POS records identified only by a free-text name that could not be tied to exactly one patient. They are still counted, under their billing identity.">
                {(data.match.unmatched + data.match.ambiguous).toLocaleString()} historical
                record(s) could not be matched to a patient profile by name and are counted
                separately.
              </span>
            </>
          )}
        </>
      ) : undefined}
    >
      {loading && !data ? (
        <BarListSkeleton rows={6} />
      ) : rows.length === 0 || data?.totalPatients === 0 ? (
        <EmptyState
          title="No confirmed sessions yet"
          hint="Nothing has been recorded for the selected branches. Try All branches."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const c = DEPT_COLORS[r.dept] ?? '#9CA3AF'
            const barPct = (r.count / max) * 100
            const name = DEPT_LABELS[r.dept] ?? r.dept
            return (
              <div
                key={r.dept}
                tabIndex={0}
                title={`${name}: ${r.count.toLocaleString()} patients · ${r.pct}% of patients with recorded treatment`}
                className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded outline-none"
              >
                {/* Label — wraps rather than truncating */}
                <span className="col-span-2 sm:col-span-1 flex items-start gap-1.5 text-xs leading-snug" style={{ color: 'var(--charcoal)' }}>
                  <DeptChip code={r.dept} color={c} />
                  <span className="break-words min-w-0">{name}</span>
                </span>

                {/* Bar */}
                <div className="h-4 rounded overflow-hidden" style={{ background: '#F3F4F6' }}>
                  <div
                    className="h-full rounded transition-all"
                    style={{ width: `${barPct}%`, background: c, minWidth: r.count > 0 ? 2 : 0 }}
                  />
                </div>

                {/* Figures */}
                <span className="text-xs whitespace-nowrap text-right" style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                  <strong className="font-semibold">{r.count.toLocaleString()}</strong>
                  <span style={{ color: 'var(--mid-gray)' }}> · </span>{r.pct}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </DashCard>
  )
}
