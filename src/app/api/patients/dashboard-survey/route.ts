// GET /api/patients/dashboard-survey?year=2026&branches=SANDBOX_EAST,...
//
// Powers the "Customer Satisfaction Survey" section on the Patient Dashboard:
// the therapist leaderboard and the positive-feedback highlights. Built for
// the INVESTOR view (the Patient Dashboard is that role's only page), and
// also available to the admin roles that already see this dashboard.
//
// Two privacy rules are enforced here, at the API layer — never only in the
// UI, or the unmasked data still ships in the network response:
//
//  1. Therapist names are masked to initials for INVESTOR sessions.
//  2. Patient/respondent identity is excluded at the QUERY level via explicit
//     `select` — SurveyResponse.respondentName/Email/Phone and the
//     assignment's patientName are never fetched into memory at all, not just
//     omitted from the response. (The existing ?view=highlights route on
//     /api/customer-survey uses `include` + assignment.patientName; that is
//     admin-only, so it is left alone, but this route must not copy it.)

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = [
  'ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'MARKETING_ADMIN', 'INVESTOR',
]

function initials(fullName: string): string {
  const parts = fullName.trim().split(/[\s,]+/).filter(Boolean)
  if (parts.length === 0) return '—'
  return parts.map(p => p[0].toUpperCase()).join('')
}

// The Patient Dashboard filters on Patient.branch enum values; Staff and
// SurveyResponse use the shorter clinic codes. Map so the section honours the
// same branch pills as the rest of the page.
const BRANCH_MAP: Record<string, string> = {
  SANDBOX_EAST: 'SBEA',
  SANDBOX_GREENHILLS: 'SBGH',
  VERDANA_STORE: 'VDNA',
}
const ALL_DASHBOARD_BRANCHES = Object.keys(BRANCH_MAP)

// Pure "Strengths and Accomplishments" free-text field per survey type.
// Mirrors the strengthKeys convention in /api/customer-survey's highlights
// view: q9 for HR10, q13 for HR11, q10 for HR12, q11 for HR16.
function strengthKeyFor(surveyType: string): string {
  if (surveyType === 'HR11') return 'q13'
  if (surveyType === 'HR12') return 'q10'
  if (surveyType === 'HR16') return 'q11'
  return 'q9'
}

// Keep everyone whose score falls within the top N DISTINCT scores, so a tie
// for 1st doesn't push everyone else off the board. Same rule the Customer
// Survey module's leaderboard uses.
function topNByDistinctScore<T extends { compositeScore: number }>(arr: T[], n: number): T[] {
  const sorted = [...arr].sort((a, b) => b.compositeScore - a.compositeScore)
  const distinct = new Set<number>()
  const out: T[] = []
  for (const row of sorted) {
    if (!distinct.has(row.compositeScore) && distinct.size >= n) break
    distinct.add(row.compositeScore)
    out.push(row)
  }
  return out
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string })?.role ?? ''
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const isInvestor = role === 'INVESTOR'

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') ?? '') || new Date().getFullYear()
  const yearStart = new Date(`${year}-01-01T00:00:00.000Z`)
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00.000Z`)

  // Only filter when a strict subset is selected — "all branches" (the
  // default) must not narrow anything.
  const requested = (searchParams.get('branches') ?? '')
    .split(',').map(b => b.trim()).filter(Boolean)
  const isSubset = requested.length > 0 && requested.length < ALL_DASHBOARD_BRANCHES.length
  const branchCodes = isSubset
    ? requested.map(b => BRANCH_MAP[b]).filter(Boolean)
    : []
  const branchWhere = branchCodes.length > 0 ? { branch: { in: branchCodes } } : {}
  // Session counts follow the staff record, and interbranch consultants carry
  // their extra branches in extraBranches — match either.
  const staffBranchWhere = branchCodes.length > 0
    ? { OR: [{ branch: { in: branchCodes } }, { extraBranches: { hasSome: branchCodes } }] }
    : {}

  const responses = await prisma.surveyResponse.findMany({
    where: {
      submittedAt: { gte: yearStart, lt: yearEnd },
      ...branchWhere,
      staff: { active: true },   // inactive staff never appear on the board
    },
    select: {
      staffId: true,
      surveyType: true,
      responsesJson: true,
      submittedAt: true,
      staff: { select: { firstName: true, lastName: true, department: true, branch: true } },
      // Deliberately NOT selected: respondentName / respondentEmail /
      // respondentPhone / assignment.patientName — see the header note.
    },
    orderBy: { submittedAt: 'desc' },
  })

  if (responses.length === 0) {
    return NextResponse.json({ year, leaderboard: [], highlights: [], totalHighlights: 0 })
  }

  const settings = await prisma.surveySettings.findUnique({ where: { id: 'default' } })
  const wConfirmed = (settings?.weightConfirmed ?? 50) / 100
  const wRescheduled = (settings?.weightRescheduled ?? 0) / 100
  const wCancelled = (settings?.weightCancelled ?? 0) / 100
  const wSatisfaction = (settings?.weightSatisfaction ?? 50) / 100

  const countsByStatus = async (status: 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED') => {
    const rows = await prisma.schedule.groupBy({
      by: ['staffId'],
      where: {
        date: { gte: yearStart, lt: yearEnd },
        status,
        ...(branchCodes.length > 0 ? { staff: staffBranchWhere } : {}),
      },
      _count: { _all: true },
    })
    return new Map(rows.map((r: { staffId: string; _count: { _all: number } }) => [r.staffId, r._count._all]))
  }
  const [sessionMap, rescheduledMap, cancelledMap] = await Promise.all([
    countsByStatus('CONFIRMED'), countsByStatus('RESCHEDULED'), countsByStatus('CANCELLED'),
  ])

  // ── Aggregate per therapist ────────────────────────────────────────────────
  type Agg = {
    staffId: string; name: string; department: string; branch: string
    totalRating: number; ratingCount: number; surveyCount: number
  }
  const byStaff = new Map<string, Agg>()

  // `name` here is the real name; it is masked on the way out, never before —
  // staffId stays the identity so same-initial therapists can't be conflated.
  type RawHighlight = {
    staffId: string; name: string; department: string; branch: string
    feedback: string; avgRating: number | null; submittedAt: string
  }
  const highlights: RawHighlight[] = []

  for (const r of responses) {
    if (!byStaff.has(r.staffId)) {
      byStaff.set(r.staffId, {
        staffId: r.staffId,
        name: `${r.staff.firstName} ${r.staff.lastName}`,
        department: r.staff.department,
        branch: r.staff.branch,
        totalRating: 0, ratingCount: 0, surveyCount: 0,
      })
    }
    const agg = byStaff.get(r.staffId)!
    agg.surveyCount++

    const json = r.responsesJson as Record<string, unknown> & { ratings?: { name: string; value: number }[] }

    let avg: number | null = null
    if (json?.ratings && json.ratings.length > 0) {
      for (const rating of json.ratings) {
        agg.totalRating += rating.value
        agg.ratingCount++
      }
      avg = parseFloat((json.ratings.reduce((a, b) => a + b.value, 0) / json.ratings.length).toFixed(2))
    }

    const val = json[strengthKeyFor(r.surveyType)]
    if (typeof val === 'string' && val.trim().length > 10) {
      highlights.push({
        staffId: r.staffId,
        name: agg.name,
        department: r.staff.department,
        branch: r.staff.branch,
        feedback: val.trim(),
        avgRating: avg,
        submittedAt: r.submittedAt.toISOString(),
      })
    }
  }

  const scoredAll = Array.from(byStaff.values()).map(s => ({
    ...s,
    avgRating: s.ratingCount > 0 ? parseFloat((s.totalRating / s.ratingCount).toFixed(2)) : 0,
    sessionsTotal: sessionMap.get(s.staffId) ?? 0,
    sessionsRescheduled: rescheduledMap.get(s.staffId) ?? 0,
    sessionsCancelled: cancelledMap.get(s.staffId) ?? 0,
  }))

  const maxConfirmed = Math.max(1, ...scoredAll.map(s => s.sessionsTotal))
  const maxRescheduled = Math.max(1, ...scoredAll.map(s => s.sessionsRescheduled))
  const maxCancelled = Math.max(1, ...scoredAll.map(s => s.sessionsCancelled))

  const scored = scoredAll.map(s => {
    const compositeScore = parseFloat((
      ((s.sessionsTotal / maxConfirmed) * wConfirmed
        + (1 - s.sessionsRescheduled / maxRescheduled) * wRescheduled
        + (1 - s.sessionsCancelled / maxCancelled) * wCancelled
        + (s.avgRating / 5) * wSatisfaction) * 100
    ).toFixed(1))
    return { ...s, compositeScore }
  })

  // Mask LAST. staffId stays the identity for all the grouping above but is
  // deliberately NOT emitted: nothing in the UI needs it, and shipping a
  // stable therapist ID alongside masked initials would undo the masking for
  // anyone who could map IDs back to names.
  const leaderboard = topNByDistinctScore(scored, 5).map(s => ({
    name: isInvestor ? initials(s.name) : s.name,
    department: s.department,
    branch: s.branch,
    avgRating: s.avgRating,
    sessionsTotal: s.sessionsTotal,
    surveyCount: s.surveyCount,
    compositeScore: s.compositeScore,
  }))

  highlights.sort((a, b) => {
    if (a.avgRating !== null && b.avgRating !== null && a.avgRating !== b.avgRating) {
      return b.avgRating - a.avgRating
    }
    return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  })

  // Drop `name` and `staffId`, emit only the masked `staffName` — spreading
  // `h` here would leak the real name alongside the masked one.
  const topHighlights = highlights.slice(0, 20).map(h => ({
    staffName:   isInvestor ? initials(h.name) : h.name,
    department:  h.department,
    branch:      h.branch,
    feedback:    h.feedback,
    avgRating:   h.avgRating,
    submittedAt: h.submittedAt,
  }))

  return NextResponse.json({
    year,
    leaderboard,
    highlights: topHighlights,
    totalHighlights: highlights.length,
  })
}
