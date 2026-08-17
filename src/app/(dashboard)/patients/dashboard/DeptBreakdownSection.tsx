'use client'

// "Patients by Service" — unique patients receiving each department's service,
// from confirmed sessions. Sits immediately above the Interdepartmental
// Service Co-occurrence section, which explains the overlap between these
// counts.

import { useState, useEffect, useCallback } from 'react'
import { Activity } from 'lucide-react'

interface DeptRow {
  dept: string
  count: number
  pct: number
}

interface Data {
  totalPatients: number
  totalRoster: number
  sessionWindow: { from: string | null; to: string | null }
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
    <div className="rounded-xl" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
      <div
        className="px-5 py-3"
        style={{ borderBottom: '1px solid var(--light-gray)' }}
      >
        <div className="flex items-center gap-2">
          <Activity size={14} style={{ color: 'var(--teal)' }} />
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>
            Patients by Service
          </p>
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
          Unique patients with confirmed sessions per department. A patient receiving two
          services is counted in both, so these add up to more than the total.
        </p>
        {data && (
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--mid-gray)' }}>
            Based on <strong>{data.totalPatients.toLocaleString()}</strong> patients with recorded
            sessions{data.sessionWindow.from ? ` between ${monthYear(data.sessionWindow.from)} and ${monthYear(data.sessionWindow.to)}` : ''}
            {' '}— percentages are of that figure, not of the{' '}
            <strong>{data.totalRoster.toLocaleString()}</strong>-patient roster. Session history
            only exists from when the Clinic Schedule module went into use, so earlier visits by
            long-standing patients are not counted here.
          </p>
        )}
      </div>

      {loading && !data ? (
        <div className="py-14 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
          Loading service breakdown…
        </div>
      ) : rows.length === 0 || data?.totalPatients === 0 ? (
        <div className="py-14 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
          No confirmed sessions for the selected branches yet.
        </div>
      ) : (
        <div className="p-5 space-y-2.5">
          {rows.map((r) => {
            const c = DEPT_COLORS[r.dept] ?? '#9CA3AF'
            const barPct = (r.count / max) * 100
            return (
              <div key={r.dept} className="flex items-center gap-3">
                {/* Label */}
                <div className="flex-shrink-0" style={{ width: 150 }}>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5"
                    style={{ background: `${c}18`, color: c }}>
                    {r.dept}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                    {DEPT_LABELS[r.dept] ?? r.dept}
                  </span>
                </div>

                {/* Bar */}
                <div className="flex-1 rounded-full overflow-hidden" style={{ height: 22, background: '#F3F4F6' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${barPct}%`, background: c, minWidth: r.count > 0 ? 2 : 0 }}
                  />
                </div>

                {/* Figures */}
                <div className="flex-shrink-0 text-right" style={{ width: 110 }}>
                  <span className="text-sm font-bold" style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                    {r.count.toLocaleString()}
                  </span>
                  <span className="text-[11px] ml-1.5" style={{ color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums' }}>
                    {r.pct}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
