'use client'

// "Customer Satisfaction Survey" results — leaderboard + positive-feedback
// highlights. Rendered by the investor-facing /customer-satisfaction page.
//
// Therapist names arrive PRE-MASKED to initials from
// /api/patients/dashboard-survey for INVESTOR sessions. Do not mask here:
// client-side masking would still ship the full names in the network
// response. Render staffName/name exactly as received.
//
// Read-only. Everything below the loader is presentation: the KPI tiles and
// the department breakdown are derived in the browser from the same payload,
// with no extra requests.

import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import {
  Trophy, Sparkles, Star, CalendarDays, ClipboardCheck, MessageSquare,
  Building2, AlertTriangle, RefreshCw, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'
import { CARD_STYLE, DashCard, KpiCard, Skeleton, BarListSkeleton, EmptyState } from '../patients/dashboard/ui'

interface LeaderRow {
  name: string
  department: string
  branch: string
  avgRating: number
  sessionsTotal: number
  surveyCount: number
  compositeScore: number
}

interface Highlight {
  staffName: string
  department: string
  branch: string
  feedback: string
  avgRating: number | null
  submittedAt: string
}

interface SurveyData {
  year: number
  leaderboard: LeaderRow[]
  highlights: Highlight[]
  totalHighlights: number
}

/** Staff branch codes (SBEA/SBGH/VDNA) → friendly label. */
function branchName(b: string): string {
  return b === 'VDNA' ? 'Verdana Store' : branchLabel(b) || b
}

const MEDALS = ['#D99A1E', '#94A3B8', '#B87333'] // gold, silver, bronze

/** Highlights shown before "Show all". Display-only. */
const HIGHLIGHTS_PREVIEW = 9

// Group by distinct score so ties share one rank, matching the Customer
// Survey module's leaderboard behaviour.
function groupByScore(rows: LeaderRow[]) {
  const groups: { rank: number; score: number; members: LeaderRow[] }[] = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    if (last && last.score === r.compositeScore) last.members.push(r)
    else groups.push({ rank: groups.length + 1, score: r.compositeScore, members: [r] })
  }
  return groups
}

// ── Small presentational pieces (same look as the Customer Survey module) ────

/** Colour band for a 1–5 rating. Purely visual. */
function ratingBand(v: number | null | undefined) {
  if (v == null) return { fg: 'var(--mid-gray)', bg: '#F3F4F6', bar: '#CBD5E1', label: 'No ratings yet' }
  if (v >= 4.5) return { fg: '#15803D', bg: '#DCFCE7', bar: '#16A34A', label: 'Excellent' }
  if (v >= 4)   return { fg: '#0F766E', bg: '#CCFBF1', bar: '#14B8A6', label: 'Good' }
  if (v >= 3)   return { fg: '#B45309', bg: '#FEF3C7', bar: '#F59E0B', label: 'Fair' }
  return { fg: '#B91C1C', bg: '#FEE2E2', bar: '#EF4444', label: 'Needs attention' }
}

function RatingPill({ value, digits = 2 }: { value: number | null | undefined; digits?: number }) {
  const b = ratingBand(value)
  return (
    <span title={value != null ? `${b.label} — average rating out of 5` : undefined}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold leading-none whitespace-nowrap"
      style={{ background: b.bg, color: b.fg, fontVariantNumeric: 'tabular-nums' }}>
      <Star size={10} fill="currentColor" strokeWidth={0} />
      {value != null ? value.toFixed(digits) : '—'}
    </span>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold leading-tight whitespace-nowrap"
      style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
      {children}
    </span>
  )
}

function ScoreLegend() {
  const bands = [
    { v: 4.5, range: '4.5 – 5' }, { v: 4, range: '4 – 4.49' }, { v: 3, range: '3 – 3.99' }, { v: 1, range: 'Below 3' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <span className="font-semibold uppercase tracking-wider">Rating bands</span>
      {bands.map(({ v, range }) => {
        const b = ratingBand(v)
        return (
          <span key={range} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: b.bar }} />
            <span style={{ color: 'var(--charcoal)' }}>{b.label}</span> {range}
          </span>
        )
      })}
    </div>
  )
}

function ErrorCard({ title, hint, onRetry }: { title: string; hint?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl px-6 py-10 text-center" style={{ background: '#fff', border: '1px solid #FECACA' }}>
      <AlertTriangle size={20} className="mx-auto mb-2" style={{ color: '#DC2626' }} />
      <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{title}</p>
      {hint && <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: 'var(--mid-gray)' }}>{hint}</p>}
      {onRetry && <RetryButton onClick={onRetry} className="mt-4" />}
    </div>
  )
}

function RetryButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors hover:bg-gray-50 ${className}`}
      style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--teal)' }}>
      <RefreshCw size={12} /> Try again
    </button>
  )
}

// ── Section ──────────────────────────────────────────────────────────────────

export default function SurveySection({ branches }: { branches: string[] }) {
  const [data, setData] = useState<SurveyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  // Display-only: surfaces a failed load instead of an empty card.
  const [failed, setFailed] = useState(false)
  // Display-only: highlights "Show all" toggle.
  const [showAll, setShowAll] = useState(false)

  const load = useCallback((brs: string[]) => {
    setLoading(true)
    setFailed(false)
    const qs = new URLSearchParams({ branches: brs.join(','), _t: String(Date.now()) })
    fetch(`/api/patients/dashboard-survey?${qs}`, { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) { setDenied(true); return null }
        if (!r.ok) { setFailed(true); return null }
        return r.json()
      })
      .then((d: SurveyData | null) => { if (d) setData(d) })
      .catch(() => { setFailed(true) })
      .finally(() => setLoading(false))
  }, [])

  // Refetch when the page's branch pills change.
  const key = branches.join(',')
  useEffect(() => {
    load(branches)
    setShowAll(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const retry = () => load(branches)

  if (denied) {
    return (
      <div className="rounded-xl" style={CARD_STYLE}>
        <EmptyState title="Survey results aren't available for your account"
          hint="Ask an administrator if you think you should be able to see this page." />
      </div>
    )
  }

  // ── First load ──
  if (loading && !data) return <LoadingState />

  // ── Failed with nothing to show ──
  if (failed && !data) {
    return <ErrorCard title="Couldn't load the survey results" hint="Check your connection and try again." onRetry={retry} />
  }

  const leaderboard = data?.leaderboard ?? []
  const highlights = data?.highlights ?? []
  const totalHighlights = data?.totalHighlights ?? highlights.length
  const hasAny = leaderboard.length > 0 || highlights.length > 0

  // Display-only summaries of the payload already in hand.
  const rated = highlights.filter((h) => h.avgRating !== null)
  const avgOnComments = rated.length > 0
    ? rated.reduce((s, h) => s + (h.avgRating ?? 0), 0) / rated.length
    : null
  const deptMap = new Map<string, { count: number; sum: number; n: number }>()
  for (const h of highlights) {
    const d = deptMap.get(h.department) ?? { count: 0, sum: 0, n: 0 }
    d.count++
    if (h.avgRating !== null) { d.sum += h.avgRating; d.n++ }
    deptMap.set(h.department, d)
  }
  const depts = Array.from(deptMap.entries())
    .map(([name, d]) => ({ name, count: d.count, avg: d.n > 0 ? d.sum / d.n : null }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const maxDept = Math.max(1, ...depts.map((d) => d.count))

  const visible = showAll ? highlights : highlights.slice(0, HIGHLIGHTS_PREVIEW)
  const year = data?.year

  return (
    <div className="space-y-5 min-w-0">
      {/* ── Status line ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
        <span className="inline-flex items-center gap-1.5">
          {year != null && <>
            <CalendarDays size={12} />
            Survey year <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{year}</span>
          </>}
        </span>
        <span className="inline-flex items-center gap-1.5" aria-live="polite">
          {loading && <><Loader2 size={12} className="animate-spin" /> Updating…</>}
        </span>
      </div>

      {/* ── A refresh failed but older results are still on screen ── */}
      {failed && data && (
        <div role="alert" className="rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <span className="flex items-center gap-2 text-xs" style={{ color: '#991B1B' }}>
            <AlertTriangle size={14} />
            Couldn&apos;t refresh the survey results — showing the last results loaded.
          </span>
          <RetryButton onClick={retry} />
        </div>
      )}

      {!hasAny ? (
        <div className="rounded-xl" style={CARD_STYLE}>
          <EmptyState title="No survey responses yet"
            hint={`Nothing has been submitted for the selected branches${year ? ` in ${year}` : ''}. Results appear here as patients complete their surveys.`} />
        </div>
      ) : (
        <div className={`space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>

          {/* ── KPIs ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Patient highlights"
              icon={<MessageSquare size={16} />}
              value={totalHighlights.toLocaleString()}
              sub={`Positive written comments${year ? ` in ${year}` : ''}`}
            />
            <KpiCard
              label="Avg rating on comments"
              icon={<Star size={16} />}
              accent="var(--gold)"
              value={avgOnComments != null
                ? <>{avgOnComments.toFixed(2)}<span className="text-sm font-semibold ml-1" style={{ color: 'var(--mid-gray)' }}>/ 5</span></>
                : '—'}
              sub={rated.length > 0 ? `Across ${rated.length.toLocaleString()} rated ${rated.length === 1 ? 'comment' : 'comments'}` : 'No ratings yet'}
            />
            <KpiCard
              label="Top therapist score"
              icon={<Trophy size={16} />}
              accent="#D99A1E"
              value={leaderboard.length > 0 ? leaderboard[0].compositeScore : '—'}
              sub="Composite score, rank #1"
            />
            <KpiCard
              label="Departments praised"
              icon={<Building2 size={16} />}
              accent="var(--bright-teal)"
              value={depts.length.toLocaleString()}
              sub="With written feedback"
            />
          </div>

          {/* ── Leaderboard + department breakdown ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <DashCard title="Therapist leaderboard" icon={<Trophy size={15} />}
              description="Top five scores. Ties share a rank."
              footer="Score blends each therapist's session activity with their average patient rating.">
              {leaderboard.length === 0 ? (
                <EmptyState title="No ranked therapists yet" hint="Rankings appear once patients submit ratings." />
              ) : (
                <ol className="space-y-2">
                  {groupByScore(leaderboard).map((g) => (
                    <LeaderGroup key={g.rank} rank={g.rank} score={g.score} members={g.members}
                      maxScore={leaderboard[0].compositeScore} />
                  ))}
                </ol>
              )}
            </DashCard>

            <DashCard title="Praise by department" icon={<Building2 size={15} />}
              description="Written highlights per department, coloured by their average rating."
              footer={<ScoreLegend />}>
              {depts.length === 0 ? (
                <EmptyState title="No written feedback yet" />
              ) : (
                <div className="space-y-2.5">
                  {depts.map((d) => {
                    const b = ratingBand(d.avg)
                    return (
                      <div key={d.name}
                        title={`${d.name}: ${d.count} ${d.count === 1 ? 'comment' : 'comments'}${d.avg != null ? ` · average ${d.avg.toFixed(2)} / 5 (${b.label})` : ''}`}
                        className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                        <span className="col-span-2 sm:col-span-1 text-xs leading-snug break-words" style={{ color: 'var(--charcoal)' }}>
                          {d.name}
                        </span>
                        <div className="h-3 rounded-full overflow-hidden" style={{ background: '#EEF2F1' }}>
                          <div className="h-full rounded-full" style={{ width: `${(d.count / maxDept) * 100}%`, background: b.bar, minWidth: 4 }} />
                        </div>
                        <span className="flex items-center gap-2 text-xs whitespace-nowrap justify-end" style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                          <strong className="font-semibold">{d.count.toLocaleString()}</strong>
                          <RatingPill value={d.avg} digits={1} />
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </DashCard>
          </div>

          {/* ── Highlights ── */}
          <DashCard title="Patient highlights" icon={<Sparkles size={15} />}
            description="Positive feedback in patients' own words, highest-rated first."
            action={highlights.length > 0 ? (
              <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{totalHighlights.toLocaleString()}</span>{' '}
                {totalHighlights === 1 ? 'comment' : 'comments'}
              </span>
            ) : undefined}>
            {highlights.length === 0 ? (
              <EmptyState title="No written feedback yet"
                hint="Highlights appear once patients share strengths and accomplishments in their surveys." />
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {visible.map((h, i) => (
                    <figure key={i} className="rounded-xl p-4 flex flex-col gap-3 min-w-0"
                      style={{ background: '#fff', border: '1px solid #E5ECEA' }}>
                      <blockquote className="text-sm leading-relaxed pl-3 break-words" style={{ color: 'var(--charcoal)', borderLeft: '3px solid var(--gold)' }}>
                        &ldquo;{h.feedback}&rdquo;
                      </blockquote>
                      <figcaption className="mt-auto flex items-center gap-x-2 gap-y-1 flex-wrap text-xs" style={{ color: 'var(--mid-gray)' }}>
                        <span className="font-semibold" style={{ color: 'var(--teal)' }}>Re: {h.staffName}</span>
                        <Chip>{h.department}</Chip>
                        <span>{branchName(h.branch)}</span>
                        {h.avgRating !== null && <RatingPill value={h.avgRating} digits={1} />}
                        <span>{new Date(h.submittedAt).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}</span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
                {highlights.length > HIGHLIGHTS_PREVIEW && (
                  <div className="flex justify-center mt-4">
                    <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold transition-colors hover:bg-gray-50"
                      style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--teal)' }}>
                      {showAll
                        ? <><ChevronUp size={13} /> Show fewer</>
                        : <><ChevronDown size={13} /> Show all {highlights.length.toLocaleString()} comments</>}
                    </button>
                  </div>
                )}
              </>
            )}
          </DashCard>
        </div>
      )}
    </div>
  )
}

// ── Leaderboard row ──────────────────────────────────────────────────────────

function LeaderGroup({ rank, score, members, maxScore }: {
  rank: number; score: number; members: LeaderRow[]; maxScore: number
}) {
  const medal = rank <= 3 ? MEDALS[rank - 1] : undefined
  const tied = members.length > 1
  const lead = members[0]
  const pct = maxScore > 0 ? Math.max(0, Math.min(100, (score / maxScore) * 100)) : 0
  return (
    <li className="rounded-lg p-3"
      style={{ background: rank === 1 ? '#FFFBEB' : '#F8FAF9', border: `1px solid ${rank === 1 ? '#FDE68A' : '#EEF2F1'}` }}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center font-bold text-sm"
          style={medal ? { background: medal + '22', color: medal } : { background: '#EEF2F1', color: 'var(--mid-gray)' }}>
          {rank}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm break-words" style={{ color: 'var(--charcoal)' }}>
              {members.map((m) => m.name).join(', ')}
            </span>
            {tied && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: '#FEF3C7', color: '#92400E' }}>
                Tied · {members.length} therapists
              </span>
            )}
          </div>
          {!tied && (
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1 text-xs" style={{ color: 'var(--mid-gray)' }}>
              <Chip>{lead.department}</Chip>
              <span>{branchName(lead.branch)}</span>
              <RatingPill value={lead.avgRating} />
              <span className="flex items-center gap-1"><CalendarDays size={10} /> {lead.sessionsTotal} sessions</span>
              <span className="flex items-center gap-1"><ClipboardCheck size={10} /> {lead.surveyCount} surveys</span>
            </div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xl font-bold leading-none"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
            {score}
          </div>
          <div className="text-[10px] uppercase font-semibold tracking-wider mt-1" style={{ color: 'var(--mid-gray)' }}>Score</div>
        </div>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden mt-2.5 ml-11" style={{ background: '#EEF2F1' }} aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: medal ?? 'var(--teal)' }} />
      </div>
    </li>
  )
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading survey results">
      <Skeleton className="h-3 w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl px-4 py-3.5" style={CARD_STYLE}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24 mt-2" />
            <Skeleton className="h-3 w-28 mt-2" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {['Therapist leaderboard', 'Praise by department'].map((t) => (
          <DashCard key={t} title={t}>
            <BarListSkeleton rows={5} />
          </DashCard>
        ))}
      </div>
      <DashCard title="Patient highlights">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl p-4" style={{ border: '1px solid #EEF2F1' }}>
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5 mt-2" />
              <Skeleton className="h-3 w-1/2 mt-4" />
            </div>
          ))}
        </div>
      </DashCard>
    </div>
  )
}
