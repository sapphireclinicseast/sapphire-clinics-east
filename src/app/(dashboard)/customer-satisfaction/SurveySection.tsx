'use client'

// "Customer Satisfaction Survey" section of the Patient Dashboard —
// leaderboard + positive-feedback highlights.
//
// Therapist names arrive PRE-MASKED to initials from
// /api/patients/dashboard-survey for INVESTOR sessions. Do not mask here:
// client-side masking would still ship the full names in the network
// response. Render staffName/name exactly as received.

import { useState, useEffect, useCallback } from 'react'
import { Trophy, Sparkles, Star, CalendarDays, ClipboardCheck } from 'lucide-react'

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

function branchShort(b: string): string {
  return b === 'SBEA' ? 'East' : b === 'SBGH' ? 'Greenhills' : b === 'VDNA' ? 'Verdana' : b
}

const MEDALS = ['#f59e0b', '#94a3b8', '#cd7f32']

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

export default function SurveySection({ branches }: { branches: string[] }) {
  const [data, setData] = useState<SurveyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  const load = useCallback((brs: string[]) => {
    setLoading(true)
    const qs = new URLSearchParams({ branches: brs.join(','), _t: String(Date.now()) })
    fetch(`/api/patients/dashboard-survey?${qs}`, { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) { setDenied(true); return null }
        return r.json()
      })
      .then((d: SurveyData | null) => { if (d) setData(d) })
      .catch(() => { /* leave the section empty rather than breaking the page */ })
      .finally(() => setLoading(false))
  }, [])

  // Refetch when the dashboard's branch pills change.
  const key = branches.join(',')
  useEffect(() => {
    load(branches)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Roles without survey access simply don't get the section.
  if (denied) return null

  const leaderboard = data?.leaderboard ?? []
  const highlights = data?.highlights ?? []
  const hasAny = leaderboard.length > 0 || highlights.length > 0

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
      <div
        className="px-5 py-3 text-xs font-semibold uppercase tracking-widest"
        style={{ borderBottom: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}
      >
        Survey Results
        <span className="ml-2 normal-case font-normal" style={{ color: 'var(--mid-gray)' }}>
          {data ? `— ${data.year}` : ''}
        </span>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-16 text-sm" style={{ color: 'var(--mid-gray)' }}>
          Loading survey results…
        </div>
      ) : !hasAny ? (
        <div className="flex items-center justify-center py-16 text-sm text-center px-6" style={{ color: 'var(--mid-gray)' }}>
          No survey responses for the selected branches yet.
        </div>
      ) : (
        <div className="grid gap-5 p-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>

          {/* ── Leaderboard ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={15} style={{ color: '#f59e0b' }} />
              <h3 className="font-bold text-sm" style={{ color: 'var(--charcoal)' }}>Leaderboard</h3>
            </div>

            {leaderboard.length === 0 ? (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--mid-gray)' }}>
                No ranked therapists yet.
              </p>
            ) : (
              <div className="space-y-2">
                {groupByScore(leaderboard).map((g) => {
                  const medal = g.rank <= 3 ? MEDALS[g.rank - 1] : undefined
                  const tied = g.members.length > 1
                  const lead = g.members[0]
                  return (
                    <div key={g.rank} className="rounded-lg p-3 flex items-center gap-3"
                      style={{ background: g.rank === 1 ? '#fffbeb' : '#f8fafc' }}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
                        style={medal ? { background: medal + '20', color: medal } : { background: '#f1f5f9', color: '#94a3b8' }}>
                        {g.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate" style={{ color: 'var(--charcoal)' }}>
                          {g.members.map(m => m.name).join(', ')}
                        </div>
                        {tied ? (
                          <div className="text-[10px] mt-0.5" style={{ color: '#94a3b8' }}>
                            TIED · {g.members.length} therapists
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px]" style={{ color: 'var(--mid-gray)' }}>
                            <span className="px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                              {lead.department}
                            </span>
                            <span>{branchShort(lead.branch)}</span>
                            <span className="flex items-center gap-0.5">
                              <Star size={9} style={{ color: '#f59e0b' }} /> {lead.avgRating.toFixed(2)}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <CalendarDays size={9} /> {lead.sessionsTotal}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <ClipboardCheck size={9} /> {lead.surveyCount}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-bold" style={{ color: g.rank === 1 ? '#f59e0b' : 'var(--teal)' }}>
                          {g.score}
                        </div>
                        <div className="text-[9px] uppercase font-semibold" style={{ color: '#94a3b8' }}>Score</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Social Media Highlights ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={15} style={{ color: '#f59e0b' }} />
              <h3 className="font-bold text-sm" style={{ color: 'var(--charcoal)' }}>Social Media Highlights</h3>
              {data && data.totalHighlights > 0 && (
                <span className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>
                  {data.totalHighlights} {data.totalHighlights === 1 ? 'comment' : 'comments'}
                </span>
              )}
            </div>

            {highlights.length === 0 ? (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--mid-gray)' }}>
                No written feedback yet.
              </p>
            ) : (
              <div className="space-y-2.5 overflow-y-auto" style={{ maxHeight: '70vh' }}>
                {highlights.map((h, i) => (
                  <div key={i} className="rounded-lg p-4"
                    style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
                    <div className="mb-2">
                      <span className="text-2xl leading-none font-serif" style={{ color: 'var(--teal)', opacity: 0.3 }}>&ldquo;</span>
                      <p className="text-sm leading-relaxed -mt-3 ml-5" style={{ color: 'var(--charcoal)' }}>
                        {h.feedback}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-[10px]" style={{ color: 'var(--mid-gray)' }}>
                      <span className="font-semibold" style={{ color: 'var(--teal)' }}>Re: {h.staffName}</span>
                      <span className="px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                        {h.department}
                      </span>
                      <span>{branchShort(h.branch)}</span>
                      {h.avgRating !== null && (
                        <span className="flex items-center gap-0.5">
                          <Star size={9} style={{ color: '#f59e0b' }} /> {h.avgRating.toFixed(1)}/5
                        </span>
                      )}
                      <span>
                        {new Date(h.submittedAt).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
