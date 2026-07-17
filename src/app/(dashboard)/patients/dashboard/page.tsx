'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Users, Baby, UserCheck, CalendarDays } from 'lucide-react'

const PatientMap = dynamic(() => import('@/components/patients/PatientMap'), { ssr: false })

interface Stats {
  total: number
  pediatricCount: number
  adultCount: number
  meanAge: number | null
  medianAge: number | null
  modeAge: number | null
  avgAge: number | null
  pyramid: { label: string; male: number; female: number; other: number }[]
  diagnoses: { name: string; male: number; female: number; other: number }[]
  locations: { barangay: string | null; city: string; count: number }[]
  cities: { name: string; count: number }[]
  branchDist: Record<string, number>
}

interface AffinityEntry {
  target: string
  color: string
  confidencePct: number
  lift: number
  coCount: number
}

interface InterdeptStats {
  totalPatients: number
  deptCounts: Record<string, number>
  comboStats: { label: string; depts: string[]; count: number; supportPct: number }[]
  affinityMatrix: { dept: string; color: string; count: number; affinities: AffinityEntry[] }[]
  avgSessionsPerMonth: Record<string, number>
}

const ALL_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE'] as const
type Branch = typeof ALL_BRANCHES[number]

const BRANCH_LABELS: Record<string, string> = {
  SANDBOX_EAST:       'East Branch',
  SANDBOX_GREENHILLS: 'Greenhills Branch',
  VERDANA_STORE:      'Verdana Store',
  UNASSIGNED:         'Unassigned',
}

const BRANCH_COLORS: Record<string, string> = {
  SANDBOX_EAST:       '#1A7B8A',
  SANDBOX_GREENHILLS: '#2AAABB',
  VERDANA_STORE:      '#52B788',
  UNASSIGNED:         '#9CA3AF',
}

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  icon, label, value, color, sub,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  color: string
  sub?: string
}) {
  return (
    <div
      className="rounded-xl p-5 flex items-center gap-4"
      style={{ background: '#fff', border: '1px solid var(--light-gray)' }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}18` }}
      >
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          {value}
        </p>
        <p className="text-xs font-semibold mt-0.5" style={{ color }}>
          {label}
        </p>
        {sub && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Custom Y-axis tick for diagnosis names (truncate to 20 chars) ─────────────
function DiagnosisTick(props: {
  x?: number
  y?: number
  payload?: { value: string }
}) {
  const { x = 0, y = 0, payload } = props
  const raw = payload?.value ?? ''
  const label = raw.length > 20 ? raw.slice(0, 20) + '…' : raw
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={4}
        textAnchor="end"
        fontSize={10}
        fill="var(--mid-gray)"
      >
        {label}
      </text>
    </g>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

// ── Lift colour helpers (Association Rule Mining) ────────────────────────────
function liftBg(l: number) {
  if (l >= 2.0) return '#dcfce7'
  if (l >= 1.5) return '#d1fae5'
  if (l >= 1.2) return '#e0f2fe'
  if (l >= 0.8) return '#f3f4f6'
  return '#fef3c7'
}
function liftFg(l: number) {
  if (l >= 2.0) return '#15803d'
  if (l >= 1.5) return '#059669'
  if (l >= 1.2) return '#0284c7'
  if (l >= 0.8) return '#6b7280'
  return '#d97706'
}
function liftLabel(l: number) {
  if (l >= 2.0) return '↑↑ Strong'
  if (l >= 1.5) return '↑ Moderate'
  if (l >= 1.2) return '↗ Slight'
  if (l >= 0.8) return '→ Neutral'
  return '↓ Weak'
}

export default function PatientDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [interdeptStats, setInterdeptStats] = useState<InterdeptStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedBranches, setSelectedBranches] = useState<Branch[]>([...ALL_BRANCHES])

  const fetchStats = useCallback((branches: Branch[]) => {
    setLoading(true)
    const hasFilter = branches.length > 0 && branches.length < ALL_BRANCHES.length
    const branchQuery = hasFilter ? `branches=${branches.join(',')}` : ''
    const tsQuery = `_t=${Date.now()}`
    const qs = [branchQuery, tsQuery].filter(Boolean).join('&')

    Promise.all([
      fetch(`/api/patients/stats?${qs}`, { cache: 'no-store' }).then((r) => r.json()),
      fetch(`/api/patients/interdept-stats?${qs}`, { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([d, id]: [Stats, InterdeptStats]) => {
        setStats(d)
        setInterdeptStats(id)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchStats(selectedBranches)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Clicking a specific branch pill selects ONLY that branch (exclusive/radio behavior).
  // Clicking "All" restores the combined view.
  function toggleBranch(branch: Branch) {
    const next: Branch[] = [branch]
    setSelectedBranches(next)
    fetchStats(next)
  }

  function selectAll() {
    const next = [...ALL_BRANCHES]
    setSelectedBranches(next)
    fetchStats(next)
  }

  // ── Error state only — loading is shown as a subtle overlay so branch pills stay visible ──
  if (!stats && !loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm" style={{ color: '#DC2626' }}>
        Failed to load stats.
      </div>
    )
  }

  // ── Derived values (safe defaults when stats is null / still loading) ──
  const pyramidData   = stats ? [...stats.pyramid].reverse() : []
  const diagnosesSlice = stats ? stats.diagnoses.slice(0, 12) : []
  const diagChartHeight = Math.max(320, diagnosesSlice.length * 36)

  const pedPct = stats && stats.total > 0
    ? Math.round((stats.pediatricCount / stats.total) * 100) : 0
  const adultPct = stats && stats.total > 0
    ? Math.round((stats.adultCount / stats.total) * 100) : 0

  const isAllSelected = selectedBranches.length === ALL_BRANCHES.length

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl space-y-8" style={{ position: 'relative' }}>
      {/* Subtle loading overlay so branch pills stay usable while refetching */}
      {loading && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 10,
            background: 'rgba(255,255,255,0.6)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: 120,
            borderRadius: 12,
          }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--teal)' }}>
            Loading…
          </span>
        </div>
      )}

      {/* ── Header ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
          Patients & Email
        </p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Patient Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
          Demographics, diagnoses, and geographic distribution of your patient base.
        </p>

        {/* Branch filter pills */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {/* All toggle */}
          <button
            onClick={selectAll}
            className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
            style={{
              background: isAllSelected ? 'var(--teal)' : 'var(--light-gray)',
              color: isAllSelected ? '#fff' : 'var(--mid-gray)',
              border: `1.5px solid ${isAllSelected ? 'var(--teal)' : 'var(--light-gray)'}`,
              cursor: 'pointer',
            }}
          >
            All
          </button>

          {ALL_BRANCHES.map((branch) => {
            const active = selectedBranches.includes(branch)
            const color = BRANCH_COLORS[branch]
            return (
              <button
                key={branch}
                onClick={() => toggleBranch(branch)}
                className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
                style={{
                  background: active ? color : '#F3F4F6',
                  color: active ? '#fff' : 'var(--mid-gray)',
                  border: `1.5px solid ${active ? color : '#E5E7EB'}`,
                  cursor: 'pointer',
                }}
              >
                {BRANCH_LABELS[branch]}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Stat cards row 1 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users size={22} style={{ color: 'var(--teal)' }} />}
          label="Total Patients"
          value={(stats?.total ?? 0).toLocaleString()}
          color="var(--teal)"
        />
        <StatCard
          icon={<Baby size={22} style={{ color: 'var(--bright-teal)' }} />}
          label="Pediatric"
          value={(stats?.pediatricCount ?? 0).toLocaleString()}
          color="var(--bright-teal)"
          sub={`${(stats?.pediatricCount ?? 0).toLocaleString()} patients · ${pedPct}% of total`}
        />
        <StatCard
          icon={<UserCheck size={22} style={{ color: 'var(--gold)' }} />}
          label="Adult"
          value={(stats?.adultCount ?? 0).toLocaleString()}
          color="var(--gold)"
          sub={`${(stats?.adultCount ?? 0).toLocaleString()} patients · ${adultPct}% of total`}
        />
        <StatCard
          icon={<CalendarDays size={22} style={{ color: '#8B5CF6' }} />}
          label="Mean Age"
          value={stats?.meanAge != null ? `${stats.meanAge} yrs` : '—'}
          color="#8B5CF6"
        />
      </div>

      {/* ── Age stats row 2 (compact) ── */}
      <div
        className="rounded-xl px-5 py-4 grid grid-cols-3 gap-4"
        style={{ background: '#fff', border: '1px solid var(--light-gray)' }}
      >
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>
            Mean Age
          </p>
          <p className="text-xl font-bold mt-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            {stats?.meanAge != null ? `${stats.meanAge} yrs` : '—'}
          </p>
        </div>
        <div className="text-center" style={{ borderLeft: '1px solid var(--light-gray)', borderRight: '1px solid var(--light-gray)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>
            Median Age
          </p>
          <p className="text-xl font-bold mt-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            {stats?.medianAge != null ? `${stats.medianAge} yrs` : '—'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>
            Mode Age
          </p>
          <p className="text-xl font-bold mt-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            {stats?.modeAge != null ? `${stats.modeAge} yrs` : '—'}
          </p>
        </div>
      </div>

      {/* ── Charts row ── */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* Population Pyramid */}
        <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          <p className="text-sm font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Population Pyramid
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={pyramidData}
              layout="vertical"
              margin={{ left: 8, right: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--light-gray)" />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: 'var(--mid-gray)' }}
                tickFormatter={(v: number) => String(Math.abs(v))}
              />
              <YAxis
                dataKey="label"
                type="category"
                tick={{ fontSize: 11, fill: 'var(--mid-gray)' }}
                width={40}
              />
              <Tooltip
                formatter={(value: number) => [Math.abs(value), '']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--light-gray)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="female" name="Female" fill="#E91E8C" stackId="a" radius={[0, 3, 3, 0]} />
              <Bar dataKey="male"   name="Male"   fill="#1A7B8A" stackId="a" radius={[0, 3, 3, 0]} />
              <Bar dataKey="other"  name="Other"  fill="#9CA3AF" stackId="a" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Diagnoses by Sex */}
        <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          <p className="text-sm font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Top Diagnoses by Sex
          </p>
          {diagnosesSlice.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-sm" style={{ color: 'var(--mid-gray)' }}>
              No diagnosis data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={diagChartHeight}>
              <BarChart
                data={diagnosesSlice}
                layout="vertical"
                margin={{ left: 8, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--light-gray)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--mid-gray)' }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={<DiagnosisTick />}
                  width={130}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--light-gray)' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="female" name="Female" fill="#E91E8C" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="male"   name="Male"   fill="#1A7B8A" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="other"  name="Other"  fill="#9CA3AF" stackId="a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Branch distribution ── */}
      {stats && Object.keys(stats.branchDist).length > 0 && (
        <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          <p className="text-sm font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Branch Distribution
          </p>
          <div className="flex flex-wrap gap-4">
            {Object.entries(stats.branchDist).map(([branch, count]) => {
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
              const color = BRANCH_COLORS[branch] ?? '#9CA3AF'
              return (
                <div
                  key={branch}
                  className="flex-1 min-w-36 rounded-xl p-4 text-center"
                  style={{ background: `${color}10`, border: `1.5px solid ${color}30` }}
                >
                  <p className="text-xl font-bold" style={{ color, fontFamily: 'var(--font-display)' }}>
                    {count}
                  </p>
                  <p className="text-xs font-semibold mt-1" style={{ color }}>
                    {BRANCH_LABELS[branch] ?? branch}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                    {pct}% of total
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Interdepartmental Service Co-occurrence ── */}
      {interdeptStats && interdeptStats.totalPatients > 0 && (
        <div className="rounded-xl" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          {/* Header */}
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--light-gray)' }}>
            <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              Interdepartmental Service Co-occurrence
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
              Based on {interdeptStats.totalPatients.toLocaleString()} patients with confirmed sessions ·
              Association strength measured by <strong>Lift</strong> (market-basket analysis) —
              Lift &gt; 1 = positively associated, Lift = 1 = independent, Lift &lt; 1 = negatively associated ·
              Confidence = P(B | A) = conditional probability
            </p>
          </div>

          <div className="p-5 space-y-6">

            {/* ── Dept reach row ── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--mid-gray)' }}>
                Patients per Department (unique, confirmed sessions)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(['OT', 'PT', 'SLP', 'SPED'] as const).map((d) => {
                  const count = interdeptStats.deptCounts[d] ?? 0
                  const pct   = interdeptStats.totalPatients > 0
                    ? Math.round((count / interdeptStats.totalPatients) * 100) : 0
                  const colors: Record<string, string> = { OT: '#1A7B8A', PT: '#2AAABB', SLP: '#F59E0B', SPED: '#8B5CF6' }
                  const c = colors[d]
                  const avg = interdeptStats.avgSessionsPerMonth[d] ?? 0
                  return (
                    <div key={d} className="rounded-xl p-4 text-center"
                      style={{ background: `${c}10`, border: `1.5px solid ${c}30` }}>
                      <p className="text-2xl font-bold" style={{ color: c, fontFamily: 'var(--font-display)' }}>
                        {count.toLocaleString()}
                      </p>
                      <p className="text-xs font-bold mt-1" style={{ color: c }}>{d}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{pct}% of patients</p>
                      <p className="text-[11px] mt-1 font-medium" style={{ color: c }}>
                        ~{avg} sessions/patient/mo
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Affinity matrix ── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--mid-gray)' }}>
                Pairwise Affinity Matrix
              </p>
              <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>
                Row = base service · Column = co-occurring service · Cell shows Confidence % (P(col | row)) and Lift
              </p>
              {/* Legend */}
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  { label: '↑↑ Strong (Lift ≥ 2.0)', bg: '#dcfce7', fg: '#15803d' },
                  { label: '↑ Moderate (1.5–2.0)',   bg: '#d1fae5', fg: '#059669' },
                  { label: '↗ Slight (1.2–1.5)',     bg: '#e0f2fe', fg: '#0284c7' },
                  { label: '→ Neutral (0.8–1.2)',    bg: '#f3f4f6', fg: '#6b7280' },
                  { label: '↓ Weak (< 0.8)',         bg: '#fef3c7', fg: '#d97706' },
                ].map((leg) => (
                  <span key={leg.label} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: leg.bg, color: leg.fg }}>
                    {leg.label}
                  </span>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="py-2 pr-3 text-left font-semibold" style={{ color: 'var(--mid-gray)', width: 90 }}>
                        If patient has →
                      </th>
                      {(['OT', 'PT', 'SLP', 'SPED'] as const).map((d) => {
                        const colors: Record<string, string> = { OT: '#1A7B8A', PT: '#2AAABB', SLP: '#F59E0B', SPED: '#8B5CF6' }
                        return (
                          <th key={d} className="py-2 px-2 text-center font-bold"
                            style={{ color: colors[d] }}>{d}</th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {interdeptStats.affinityMatrix.map((row) => (
                      <tr key={row.dept} style={{ borderTop: '1px solid var(--light-gray)' }}>
                        <td className="py-2 pr-3 font-bold" style={{ color: row.color }}>
                          {row.dept}
                          <span className="ml-1 font-normal text-[10px]" style={{ color: 'var(--mid-gray)' }}>
                            (n={row.count})
                          </span>
                        </td>
                        {(['OT', 'PT', 'SLP', 'SPED'] as const).map((target) => {
                          if (target === row.dept) {
                            return (
                              <td key={target} className="py-2 px-2 text-center"
                                style={{ background: '#f9fafb', color: '#d1d5db' }}>—</td>
                            )
                          }
                          const aff = row.affinities.find((a) => a.target === target)
                          if (!aff) return <td key={target} className="py-2 px-2 text-center">—</td>
                          return (
                            <td key={target} className="py-2 px-2 text-center rounded"
                              style={{ background: liftBg(aff.lift) }}>
                              <div className="font-bold" style={{ color: 'var(--charcoal)', fontSize: 12 }}>
                                {aff.confidencePct}%
                              </div>
                              <div className="text-[10px] font-semibold" style={{ color: liftFg(aff.lift) }}>
                                Lift {aff.lift.toFixed(2)}
                              </div>
                              <div className="text-[9px]" style={{ color: liftFg(aff.lift) }}>
                                {liftLabel(aff.lift)}
                              </div>
                              <div className="text-[9px]" style={{ color: '#9ca3af' }}>
                                n={aff.coCount}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Combination counts ── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--mid-gray)' }}>
                Multi-Service Combinations
              </p>
              <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>
                Counts are <em>at least</em> these services (patient may also use others) · Support = % of all patients in scope
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {interdeptStats.comboStats.map((c) => {
                  const deptColorMap: Record<string, string> = { OT: '#1A7B8A', PT: '#2AAABB', SLP: '#F59E0B', SPED: '#8B5CF6' }
                  const supportStrength = c.supportPct >= 20 ? '#15803d'
                    : c.supportPct >= 10 ? '#059669'
                    : c.supportPct >= 5  ? '#0284c7'
                    : '#6b7280'
                  return (
                    <div key={c.label} className="rounded-lg px-4 py-3 flex items-center justify-between gap-3"
                      style={{ border: '1px solid var(--light-gray)', background: '#fafafa' }}>
                      <div>
                        <div className="flex gap-1 flex-wrap mb-1">
                          {c.depts.map((d) => (
                            <span key={d} className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: `${deptColorMap[d] ?? '#9CA3AF'}18`, color: deptColorMap[d] ?? '#9CA3AF' }}>
                              {d}
                            </span>
                          ))}
                        </div>
                        <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{c.label}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                          {c.count.toLocaleString()}
                        </p>
                        <p className="text-[11px] font-semibold" style={{ color: supportStrength }}>
                          {c.supportPct.toFixed(1)}% support
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Map ── */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
        <div
          className="px-5 py-3 text-xs font-semibold uppercase tracking-widest"
          style={{ borderBottom: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}
        >
          Patient Geographic Distribution
          <span className="ml-2 normal-case font-normal" style={{ color: 'var(--mid-gray)' }}>
            — darker color = more patients · gold dots = clinic locations
          </span>
        </div>
        {!stats || (stats.cities.length === 0 && stats.locations.length === 0) ? (
          <div className="flex items-center justify-center py-24 text-sm" style={{ color: 'var(--mid-gray)' }}>
            No location data available. Add city or barangay information when importing patients.
          </div>
        ) : (
          <div style={{ height: 480 }}>
            <PatientMap cities={stats.cities} locations={stats.locations} />
          </div>
        )}
      </div>

    </div>
  )
}
