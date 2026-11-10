'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Users, Baby, UserCheck, CalendarDays, MapPin, BarChart3, Stethoscope, Building2, Network,
  Loader2, ChevronDown,
} from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'

import PatientBubbleCharts, { type DiagnosisDeptData } from '@/components/patients/PatientBubbleCharts'
import DeptBreakdownSection from './DeptBreakdownSection'
import LifetimeSection from './LifetimeSection'
import MdSubspecialtySection from './MdSubspecialtySection'
import { rrPhrase, type AffinityEntry, type MdSubRow, type MdSubCoverage } from './affinity'
import { CARD_STYLE, DashCard, KpiCard, Skeleton, BarListSkeleton, EmptyState, DeptChip } from './ui'

const PatientMap = dynamic(() => import('@/components/patients/PatientMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center animate-pulse" style={{ background: '#eef3f1' }}>
      <span className="text-xs font-medium" style={{ color: 'var(--mid-gray)' }}>Loading map…</span>
    </div>
  ),
})

interface Stats {
  total: number
  pediatricCount: number
  adultCount: number
  meanAge: number | null
  medianAge: number | null
  modeAge: number | null
  avgAge: number | null
  pyramid: { label: string; male: number; female: number; other: number }[]
  diagnoses: { name: string; male: number; female: number; other: number; pct: number }[]
  /** Patients with a usable diagnosis — the denominator behind each pct. */
  diagnosedPatients?: number
  locations: { barangay: string | null; city: string; count: number }[]
  cities: { name: string; count: number }[]
  branchDist: Record<string, number>
}

interface InterdeptStats {
  totalPatients: number
  deptCounts: Record<string, number>
  comboStats: { label: string; depts: string[]; count: number; supportPct: number }[]
  affinityMatrix: { dept: string; color: string; count: number; affinities: AffinityEntry[] }[]
  avgSessionsPerMonth: Record<string, number>
  comboTotal?: number
  /** MD broken out into DevPed / Rehab Med / Psychiatry. Absent when the API
   *  predates the panel, so the section must render conditionally. */
  mdSubMatrix?: MdSubRow[]
  mdSubCoverage?: MdSubCoverage
}

const ALL_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE'] as const
type Branch = typeof ALL_BRANCHES[number]

// UNASSIGNED has no Branches Registry row — it's a dashboard-only bucket
// for patients with no branch set, not a real branch.
function dashboardBranchLabel(b: string): string {
  return b === 'UNASSIGNED' ? 'Unassigned' : branchLabel(b)
}

const BRANCH_COLORS: Record<string, string> = {
  SANDBOX_EAST:       '#1A7B8A',
  SANDBOX_GREENHILLS: '#2AAABB',
  VERDANA_STORE:      '#52B788',
  UNASSIGNED:         '#9CA3AF',
}

const SEX_SERIES = [
  { key: 'female', label: 'Female', color: '#E91E8C' },
  { key: 'male',   label: 'Male',   color: '#1A7B8A' },
  { key: 'other',  label: 'Other',  color: '#9CA3AF' },
] as const

const DEPT_ORDER = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY'] as const
const DEPT_COLOR_MAP: Record<string, string> = {
  OT: '#1A7B8A', PT: '#2AAABB', SLP: '#F59E0B', SPED: '#8B5CF6', MD: '#DC2626', PSYCHOLOGY: '#7C3AED',
}

const TOOLTIP_STYLE = {
  fontSize: 12, borderRadius: 8, border: '1px solid var(--light-gray)',
  boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
}

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

// ── Sub-section heading inside a card ────────────────────────────────────────
function SubHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="text-[13px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
        {title}
      </h3>
      {children && <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--mid-gray)' }}>{children}</p>}
    </div>
  )
}

// ── Hover tooltip for HTML bar rows ──────────────────────────────────────────
function RowTip({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute left-1/2 bottom-full mb-1.5 -translate-x-1/2 z-20 hidden group-hover:block group-focus-within:block whitespace-nowrap rounded-lg px-3 py-2 text-[11px]"
      style={{ background: '#fff', ...TOOLTIP_STYLE, color: 'var(--charcoal)' }}
    >
      {children}
    </div>
  )
}

// ── Top diagnoses: stacked bars with the full family name ───────────────────
function DiagnosisBars({ rows }: { rows: Stats['diagnoses'] }) {
  const totals = rows.map((r) => (r.male ?? 0) + (r.female ?? 0) + (r.other ?? 0))
  const max = Math.max(1, ...totals)
  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-3">
        {SEX_SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--charcoal)' }}>
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="space-y-2.5">
        {rows.map((r, i) => {
          const n = totals[i]
          return (
            <div
              key={r.name}
              tabIndex={0}
              className="group relative grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--light-gray)]"
            >
              <span className="col-span-2 sm:col-span-1 text-xs leading-snug break-words" style={{ color: 'var(--charcoal)' }}>
                {r.name}
              </span>
              <div className="flex h-4 rounded overflow-hidden" style={{ background: '#F3F4F6' }}>
                {SEX_SERIES.map((s) => {
                  const v = r[s.key] ?? 0
                  if (!v) return null
                  return <div key={s.key} style={{ width: `${(v / max) * 100}%`, background: s.color }} />
                })}
              </div>
              <span className="text-xs whitespace-nowrap text-right" style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                {/* Count and share together. The absolute number alone does not
                    say whether 94 is most of the clinic or a corner of it. */}
                <strong className="font-semibold">{n.toLocaleString()}</strong>
                <span style={{ color: 'var(--mid-gray)' }}> · </span>
                {r.pct ?? 0}%
              </span>
              <RowTip>
                <div className="font-semibold mb-0.5 whitespace-normal max-w-[16rem]">{r.name}</div>
                {SEX_SERIES.map((s) => (
                  <div key={s.key} className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-sm" style={{ background: s.color }} />
                    {s.label}: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{(r[s.key] ?? 0).toLocaleString()}</span>
                  </div>
                ))}
                <div className="mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                  {n.toLocaleString()} patients · {r.pct ?? 0}%
                </div>
              </RowTip>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PatientDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [interdeptStats, setInterdeptStats] = useState<InterdeptStats | null>(null)
  const [diagDeptStats, setDiagDeptStats] = useState<DiagnosisDeptData | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
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
      // Optional: a failure here must not blank the rest of the dashboard.
      fetch(`/api/patients/diagnosis-dept-stats?${qs}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([d, id, dd]: [Stats, InterdeptStats, DiagnosisDeptData | null]) => {
        setStats(d)
        setInterdeptStats(id)
        setDiagDeptStats(dd)
        setUpdatedAt(new Date())
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Keep a ref so the polling interval always uses the current branch selection
  // without needing to be re-registered every time branches change.
  const branchesRef = useRef(selectedBranches)
  useEffect(() => { branchesRef.current = selectedBranches })

  useEffect(() => {
    fetchStats(selectedBranches)
    const id = setInterval(() => fetchStats(branchesRef.current), 90_000)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Clicking a specific branch selects ONLY that branch (exclusive/radio behavior).
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

  const failed = !stats && !loading
  const initialLoad = !stats && loading

  // ── Derived values (safe defaults when stats is null / still loading) ──
  const pyramidData   = stats ? [...stats.pyramid].reverse() : []
  const pyramidEmpty  = pyramidData.every((r) => !r.male && !r.female && !r.other)
  const diagnosesSlice = stats ? stats.diagnoses.slice(0, 12) : []

  const pedPct = stats && stats.total > 0
    ? Math.round((stats.pediatricCount / stats.total) * 100) : 0
  const adultPct = stats && stats.total > 0
    ? Math.round((stats.adultCount / stats.total) * 100) : 0

  const isAllSelected = selectedBranches.length === ALL_BRANCHES.length
  const scopeLabel = isAllSelected ? 'All branches' : selectedBranches.map(dashboardBranchLabel).join(', ')
  const yrs = (v: number | null | undefined) => (v != null ? `${v} yrs` : '—')

  const pill = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${active ? '' : 'hover:bg-gray-50'}`

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl space-y-5">

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
      </div>

      {/* ── Toolbar ── */}
      <div className="rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2" style={CARD_STYLE}>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Branch filter">
          <span className="text-[11px] font-semibold uppercase tracking-wider mr-1.5" style={{ color: 'var(--mid-gray)' }}>
            Branch
          </span>
          <button
            type="button"
            onClick={selectAll}
            aria-pressed={isAllSelected}
            className={pill(isAllSelected)}
            style={{
              background: isAllSelected ? 'var(--teal)' : 'transparent',
              color: isAllSelected ? '#fff' : 'var(--charcoal)',
            }}
          >
            All
          </button>
          {ALL_BRANCHES.map((branch) => {
            const active = !isAllSelected && selectedBranches.includes(branch)
            return (
              <button
                key={branch}
                type="button"
                onClick={() => toggleBranch(branch)}
                aria-pressed={active}
                className={pill(active)}
                style={{
                  background: active ? 'var(--teal)' : 'transparent',
                  color: active ? '#fff' : 'var(--charcoal)',
                }}
              >
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: BRANCH_COLORS[branch], boxShadow: active ? '0 0 0 1.5px #fff' : undefined }} />
                {dashboardBranchLabel(branch)}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }} aria-live="polite">
          {loading ? (
            <><Loader2 size={12} className="animate-spin" /> Updating…</>
          ) : updatedAt ? (
            <>Updated {updatedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })} · refreshes every 90 s</>
          ) : null}
        </div>
      </div>

      {failed && (
        <div className="rounded-xl" style={CARD_STYLE}>
          <EmptyState
            title="Couldn't load the patient statistics"
            hint="Check your connection, then pick a branch above to try again."
          />
        </div>
      )}

      {/* ── KPIs ── */}
      {!failed && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {initialLoad ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl px-4 py-3.5" style={CARD_STYLE}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-24 mt-2" />
                <Skeleton className="h-3 w-28 mt-2" />
              </div>
            ))
          ) : (
            <>
              <KpiCard
                label="Total Patients"
                icon={<Users size={16} />}
                value={(stats?.total ?? 0).toLocaleString()}
                sub={scopeLabel}
              />
              <KpiCard
                label="Pediatric"
                icon={<Baby size={16} />}
                accent="var(--bright-teal)"
                value={(stats?.pediatricCount ?? 0).toLocaleString()}
                sub={`${pedPct}% of total`}
              />
              <KpiCard
                label="Adult"
                icon={<UserCheck size={16} />}
                accent="var(--gold)"
                value={(stats?.adultCount ?? 0).toLocaleString()}
                sub={`${adultPct}% of total`}
              />
              <KpiCard
                label="Mean Age"
                icon={<CalendarDays size={16} />}
                accent="#8B5CF6"
                value={yrs(stats?.meanAge)}
                sub={`Median ${yrs(stats?.medianAge)} · Mode ${yrs(stats?.modeAge)}`}
              />
            </>
          )}
        </div>
      )}

      {/* ── Map ── */}
      {!failed && (
        <DashCard
          title="Patient Geographic Distribution"
          icon={<MapPin size={15} />}
          description="Patients per city or municipality — darker colour = more patients. Opens on the area where most patients live; gold dots are clinic locations."
          flush
          className="overflow-hidden"
        >
          {initialLoad ? (
            <Skeleton className="h-[420px] md:h-[520px] rounded-none" />
          ) : !stats || (stats.cities.length === 0 && stats.locations.length === 0) ? (
            <EmptyState
              title="No location data yet"
              hint="Add city or barangay information when importing patients and they'll appear here."
            />
          ) : (
            <div className="h-[420px] md:h-[520px]">
              <PatientMap cities={stats.cities} locations={stats.locations} />
            </div>
          )}
        </DashCard>
      )}

      {/* ── Demographics ── */}
      {!failed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Population Pyramid */}
          <DashCard
            title="Population Pyramid"
            icon={<BarChart3 size={15} />}
            description="Patients in each age band, split by sex."
          >
            {initialLoad ? (
              <Skeleton className="h-[300px]" />
            ) : pyramidEmpty ? (
              <EmptyState title="No age data yet" hint="Patients appear here once a birth date or age is recorded." />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={pyramidData}
                  layout="vertical"
                  margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--light-gray)" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: 'var(--mid-gray)' }}
                    tickFormatter={(v: number) => String(Math.abs(v))}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="label"
                    type="category"
                    tick={{ fontSize: 11, fill: 'var(--charcoal)' }}
                    width={44}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(36,73,82,0.06)' }}
                    formatter={(value, name) => [Math.abs(Number(value)).toLocaleString(), String(name)]}
                    labelFormatter={(l) => `Age ${l}`}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" iconSize={10} />
                  <Bar dataKey="female" name="Female" fill="#E91E8C" stackId="a" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="male"   name="Male"   fill="#1A7B8A" stackId="a" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="other"  name="Other"  fill="#9CA3AF" stackId="a" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </DashCard>

          {/* Top Diagnoses by Sex */}
          <DashCard
            title="Top Diagnoses by Sex"
            icon={<Stethoscope size={15} />}
            // Says what the percentage is out of, and warns that it sums past
            // 100% — otherwise a reader adds the bars, gets 110%, and distrusts
            // the whole chart rather than the one thing they misread.
            description={stats?.diagnosedPatients
              ? `Share of ${stats.diagnosedPatients.toLocaleString()} patients with a recorded diagnosis. Related wordings are grouped; a patient with several conditions counts in each, so shares total over 100%.`
              : 'Related wordings are grouped; a patient with several conditions counts in each.'}
          >
            {initialLoad ? (
              <BarListSkeleton rows={8} />
            ) : diagnosesSlice.length === 0 ? (
              <EmptyState title="No diagnosis data yet" hint="Diagnoses appear here once they're recorded on patient profiles." />
            ) : (
              <DiagnosisBars rows={diagnosesSlice} />
            )}
          </DashCard>
        </div>
      )}

      {/* ── Diagnosis × department × sex ── */}
      {!failed && stats && <PatientBubbleCharts data={diagDeptStats} />}

      {/* ── Branch distribution + Patients by Service ── */}
      {!failed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <DashCard
            title="Branch Distribution"
            icon={<Building2 size={15} />}
            description="Patients registered at each branch, as a share of the total. A patient at two branches counts in both."
          >
            {initialLoad ? (
              <BarListSkeleton rows={3} />
            ) : !stats || Object.keys(stats.branchDist).length === 0 ? (
              <EmptyState title="No branch data yet" />
            ) : (
              <div className="space-y-3">
                {Object.entries(stats.branchDist).map(([branch, count]) => {
                  const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
                  const color = BRANCH_COLORS[branch] ?? '#9CA3AF'
                  return (
                    <div key={branch} tabIndex={0} className="group relative grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded outline-none">
                      <span className="col-span-2 sm:col-span-1 flex items-center gap-2 text-xs leading-snug" style={{ color: 'var(--charcoal)' }}>
                        <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        {dashboardBranchLabel(branch)}
                      </span>
                      <div className="h-4 rounded overflow-hidden" style={{ background: '#F3F4F6' }}>
                        <div className="h-full rounded transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color, minWidth: count > 0 ? 2 : 0 }} />
                      </div>
                      <span className="text-xs whitespace-nowrap text-right" style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                        <strong className="font-semibold">{count.toLocaleString()}</strong>
                        <span style={{ color: 'var(--mid-gray)' }}> · </span>{pct}%
                      </span>
                      <RowTip>
                        <div className="font-semibold">{dashboardBranchLabel(branch)}</div>
                        <div>{count.toLocaleString()} patients · {pct}% of total</div>
                      </RowTip>
                    </div>
                  )
                })}
              </div>
            )}
          </DashCard>

          {/* ── Patients by Service ── */}
          <DeptBreakdownSection branches={selectedBranches} />
        </div>
      )}

      {/* ── Patient Lifetime by Service ── counts the same patients the
           section above breaks down, measured over time rather than totalled */}
      {!failed && <LifetimeSection branches={selectedBranches} />}

      {/* ── Interdepartmental Service Co-occurrence ── */}
      {initialLoad && (
        <div className="rounded-xl p-5" style={CARD_STYLE}>
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-3 w-96 max-w-full mt-2" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
          <Skeleton className="h-56 mt-5" />
        </div>
      )}
      {interdeptStats && interdeptStats.totalPatients > 0 && (
        <DashCard
          title="Interdepartmental Service Co-occurrence"
          icon={<Network size={15} />}
          description={
            <>
              How often patients of one service also use another. Based on{' '}
              {interdeptStats.totalPatients.toLocaleString()} patients with recorded treatment
              (Clinic Schedule sessions plus POS billing history, so visits from before this hub was in use are included).
            </>
          }
        >
          <div className="space-y-7">

            {/* Glossary — kept in full, folded away so the card opens on the figures */}
            <details className="group rounded-lg px-4 py-2.5" style={{ background: '#f8faf9', border: '1px solid var(--light-gray)' }}>
              <summary className="cursor-pointer list-none flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--teal)' }}>
                <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
                How to read these figures
              </summary>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--charcoal)' }}>
                <strong>Confidence</strong> = if patient has Row, % chance they also have Column ·{' '}
                <strong>RR</strong> = how many times more likely the Column service is for patients who use Row,
                compared with patients who do not — the figure to quote, age-adjusted with 95% CI ·{' '}
                <strong>Lift</strong> = same idea but measured against the clinic-wide rate, so it sits closer to 1 ·{' '}
                <strong>φ</strong> = effect size −1 to +1 (the correlation coefficient for two yes/no variables) ·{' '}
                <strong>OR</strong> = odds ratio, for comparing pairs and adjusting; it multiplies odds, not
                chances, so for services this common it runs above RR and should not be read as &ldquo;times more likely&rdquo; ·{' '}
                <strong>q</strong> = p-value after Benjamini–Hochberg correction across the 15 distinct pairs.
                Pairs too sparse for the χ² approximation use Fisher&apos;s exact test instead.
              </p>
            </details>

            {/* ── Dept reach row ── */}
            <div>
              <SubHeading title="Patients per Department">
                Unique patients with confirmed sessions, and how often they come.
              </SubHeading>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {DEPT_ORDER.map((d) => {
                  const count = interdeptStats.deptCounts[d] ?? 0
                  const pct   = interdeptStats.totalPatients > 0
                    ? Math.round((count / interdeptStats.totalPatients) * 100) : 0
                  const c = DEPT_COLOR_MAP[d]
                  const avg = interdeptStats.avgSessionsPerMonth[d] ?? 0
                  return (
                    <div key={d} className="rounded-lg px-3.5 py-3 min-w-0" style={{ border: '1px solid var(--light-gray)', borderTop: `3px solid ${c}` }}>
                      <DeptChip code={d} color={c} />
                      <p className="text-xl font-bold mt-1.5 leading-tight" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>
                        {count.toLocaleString()}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{pct}% of patients</p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--charcoal)' }}>
                        ~{avg} sessions/patient/mo
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Affinity matrix ── */}
            <div>
              <SubHeading title="Pairwise Affinity Matrix">
                Row = base service · Each cell = chance that row patient also uses that column service · ✓ = statistically significant after Bonferroni correction
              </SubHeading>
              {/* Legend */}
              <div className="flex flex-wrap gap-2 mb-4">
                {[
                  { label: '↑↑ Strong — over 2× more likely than chance',    bg: '#dcfce7', fg: '#15803d' },
                  { label: '↑ Moderate — 1.5–2× more likely than chance',    bg: '#d1fae5', fg: '#059669' },
                  { label: '↗ Slight — 1.2–1.5× more likely than chance',    bg: '#e0f2fe', fg: '#0284c7' },
                  { label: '→ Neutral — about as expected by chance',         bg: '#f3f4f6', fg: '#6b7280' },
                  { label: '↓ Weak — less likely together than by chance',    bg: '#fef3c7', fg: '#d97706' },
                ].map((leg) => (
                  <span key={leg.label} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: leg.bg, color: leg.fg }}>
                    {leg.label}
                  </span>
                ))}
              </div>
              <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--light-gray)' }}>
                <table className="text-xs border-collapse" style={{ width: '100%', minWidth: 980, tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 80 }} />
                    {DEPT_ORDER.map((d) => <col key={d} style={{ width: 110 }} />)}
                    <col style={{ width: 240 }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: '#f8faf9', borderBottom: '1px solid var(--light-gray)' }}>
                      <th className="py-2 px-2 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>
                        If has…
                      </th>
                      {DEPT_ORDER.map((d) => (
                        <th key={d} className="py-2 px-2 text-center font-bold"
                          style={{ color: DEPT_COLOR_MAP[d] }}>…also uses {d}?</th>
                      ))}
                      <th className="py-2 pl-3 pr-2 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>
                        Plain Reading
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {interdeptStats.affinityMatrix.map((row) => {
                      // Build plain reading for this row
                      const sigAffs = row.affinities.filter((a) => a.pSig).sort((a, b) => b.lift - a.lift)
                      const topAff  = sigAffs[0] ?? [...row.affinities].sort((a, b) => b.confidencePct - a.confidencePct)[0]
                      let plain = ''
                      if (!topAff) {
                        plain = 'Not enough data to draw conclusions.'
                      } else if (sigAffs.length === 0) {
                        plain = `No statistically significant overlap found. ${row.dept} patients use other departments at roughly random rates — coincidence cannot be ruled out.`
                      } else if (topAff.lift >= 2.0) {
                        // Quote the risk ratio, not lift: "x times as likely as a
                        // patient who does not use this service" is the claim being
                        // made, and lift's denominator includes the exposed group.
                        plain = `Strong pairing: ${topAff.confidencePct}% of ${row.dept} patients also use ${topAff.target}${rrPhrase(topAff)}. This is a reliable, clinically meaningful co-occurrence. (${topAff.qLabel || topAff.pLabel})`
                      } else if (topAff.lift >= 1.5) {
                        plain = `Notable tendency: ${row.dept} patients are more likely to also use ${topAff.target}${rrPhrase(topAff)}. Worth considering as a cross-referral opportunity. (${topAff.qLabel || topAff.pLabel})`
                      } else if (topAff.lift >= 1.2) {
                        plain = `Mild tendency toward ${topAff.target} (${topAff.confidencePct}%, Lift ${topAff.lift.toFixed(2)}). The overlap is above chance but modest — not a strong predictor on its own. (${topAff.pLabel})`
                      } else {
                        plain = `${row.dept} patients use other departments at near-random rates. No meaningful cross-service trend detected.`
                      }

                      return (
                        <tr key={row.dept} style={{ borderTop: '1px solid var(--light-gray)' }}>
                          {/* Row label */}
                          <td className="py-3 px-2 font-bold align-top" style={{ color: row.color }}>
                            {row.dept}
                            <div className="font-normal text-[10px]" style={{ color: 'var(--mid-gray)' }}>
                              n={row.count.toLocaleString()}
                            </div>
                          </td>

                          {/* Matrix cells */}
                          {DEPT_ORDER.map((target) => {
                            if (target === row.dept) {
                              return (
                                <td key={target} className="py-3 px-2 text-center align-top"
                                  style={{ background: '#f9fafb', color: '#d1d5db' }}>—</td>
                              )
                            }
                            const aff = row.affinities.find((a) => a.target === target)
                            if (!aff) return <td key={target} className="py-3 px-2 text-center align-top">—</td>
                            return (
                              <td key={target} className="py-2 px-2 text-center align-top"
                                style={{ background: liftBg(aff.lift) }}>
                                {/* Confidence — the headline number */}
                                <div className="font-bold" style={{ color: 'var(--charcoal)', fontSize: 13 }}>
                                  {aff.confidencePct}%
                                </div>
                                {/* Lift */}
                                <div className="text-[10px] font-semibold mt-0.5" style={{ color: liftFg(aff.lift) }}>
                                  Lift {aff.lift.toFixed(2)} {liftLabel(aff.lift)}
                                </div>
                                {/* φ coefficient */}
                                <div className="text-[10px] mt-0.5" style={{ color: liftFg(aff.lift) }}>
                                  φ = {aff.phi >= 0 ? '+' : ''}{aff.phi.toFixed(2)}
                                </div>
                                {/* Risk ratio first: it is the one that can be read
                                    aloud as "x times more likely". */}
                                {aff.riskRatio != null && (
                                  <div className="text-[10px] mt-0.5 font-semibold" style={{ color: liftFg(aff.lift) }}>
                                    {aff.riskRatio.toFixed(2)}× as likely
                                    {aff.riskCiLow != null && aff.riskCiHigh != null && (
                                      <span className="font-normal" style={{ color: '#9ca3af' }}>
                                        {' '}({aff.riskCiLow.toFixed(2)}–{aff.riskCiHigh.toFixed(2)})
                                      </span>
                                    )}
                                  </div>
                                )}
                                {/* Age-adjusted odds ratio with CI — the estimate to
                                    read when pediatric and adult patients use
                                    services this differently. */}
                                {aff.oddsRatio != null && (
                                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                                    OR {aff.oddsRatio.toFixed(2)}
                                    {aff.oddsCiLow != null && aff.oddsCiHigh != null && (
                                      <span style={{ color: '#9ca3af' }}>
                                        {' '}({aff.oddsCiLow.toFixed(2)}–{aff.oddsCiHigh.toFixed(2)})
                                      </span>
                                    )}
                                  </div>
                                )}
                                {/* FDR-adjusted significance */}
                                <div className="text-[10px] mt-0.5 font-medium"
                                  style={{ color: aff.pSig ? '#15803d' : '#9ca3af' }}>
                                  {aff.pSig ? '✓ ' : ''}{aff.qLabel || aff.pLabel}
                                </div>
                                {/* co-count + method/confounding flags */}
                                <div className="text-[9px] mt-0.5" style={{ color: '#9ca3af' }}>
                                  {aff.coCount.toLocaleString()} shared patients
                                  {aff.exact ? ' · Fisher' : ''}
                                  {aff.smallCell ? ' ⚠' : ''}
                                </div>
                                {aff.ageConfounded && (
                                  <div className="text-[9px] mt-0.5 font-medium" style={{ color: '#B45309' }}
                                    title={`Unadjusted OR ${aff.crudeOddsRatio?.toFixed(2)} vs age-adjusted ${aff.oddsRatio?.toFixed(2)} — pediatric and adult patients differ enough that the pooled figure misleads.`}>
                                    ⚠ age-confounded
                                  </div>
                                )}
                              </td>
                            )
                          })}

                          {/* Plain Reading */}
                          <td className="py-3 pl-3 pr-2 align-top text-[11px] leading-relaxed"
                            style={{ color: 'var(--charcoal)', borderLeft: '1px solid var(--light-gray)' }}>
                            {plain}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] mt-2" style={{ color: 'var(--mid-gray)' }}>
                ⚠ = expected cell count &lt; 5; chi-square less reliable for those cells · φ (phi) is the effect size: |φ| &lt; 0.1 = negligible, 0.1–0.3 = small, 0.3–0.5 = medium, &gt; 0.5 = large
              </p>
            </div>

            {/* ── MD by subspecialty ── the MD row above averages three
                 practices that refer into different therapy lines, so it is
                 split out rather than read as one pattern */}
            {interdeptStats.mdSubMatrix && (
              <MdSubspecialtySection
                rows={interdeptStats.mdSubMatrix}
                coverage={interdeptStats.mdSubCoverage}
                totalPatients={interdeptStats.totalPatients}
              />
            )}

            {/* ── Combination counts ── */}
            <div>
              <SubHeading title="Multi-Service Combinations">
                Counts are <em>at least</em> these services (patient may also use others) · Support = % of all patients in scope
                {interdeptStats.comboTotal && interdeptStats.comboTotal > interdeptStats.comboStats.length
                  ? ` · showing the ${interdeptStats.comboStats.length} largest of ${interdeptStats.comboTotal} combinations that occur`
                  : ''}
              </SubHeading>
              {interdeptStats.comboStats.length === 0 ? (
                <EmptyState title="No multi-service patients yet" />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {interdeptStats.comboStats.map((c) => {
                    const supportStrength = c.supportPct >= 20 ? '#15803d'
                      : c.supportPct >= 10 ? '#059669'
                      : c.supportPct >= 5  ? '#0284c7'
                      : '#6b7280'
                    return (
                      <div key={c.label} className="rounded-lg px-4 py-3 flex items-center justify-between gap-3"
                        style={{ border: '1px solid var(--light-gray)' }}>
                        <div className="min-w-0">
                          <div className="flex gap-1 flex-wrap mb-1">
                            {c.depts.map((d) => (
                              <DeptChip key={d} code={d} color={DEPT_COLOR_MAP[d] ?? '#9CA3AF'} />
                            ))}
                          </div>
                          <p className="text-[11px] leading-snug" style={{ color: 'var(--mid-gray)' }}>{c.label}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
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
              )}
            </div>

          </div>
        </DashCard>
      )}

    </div>
  )
}
