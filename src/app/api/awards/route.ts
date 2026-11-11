// GET /api/awards?year=2026
//
// The annual awards, computed rather than compiled by hand.
//
// Eight categories. Six are decided on a rating and require at least five
// responses to qualify; two are decided on session count and do not — a
// consultant who saw the most children saw the most children, whether or not
// their patients filled anything in.
//
// Everything is derived from what is already recorded. Nothing here writes,
// and nothing is a judgement call: the rules are the rules below, the
// arithmetic is stated on the page, and anyone who did not qualify is named
// with the reason rather than quietly dropped.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { StaffDepartment, SurveyType } from '@prisma/client'
import { SURVEY_SCALE_MAX } from '@/lib/survey-scale'

export const dynamic = 'force-dynamic'

/**
 * How many responses a person needs before a rating counts.
 *
 * Five, because an average of one or two says more about who happened to fill
 * the form in than about the clinician. It applies to the six rating awards
 * and deliberately NOT to the two session-count awards.
 */
export const MIN_RESPONSES = 5

/** The rating scale the surveys and peer evaluations are answered on. */
const SCALE_MAX = SURVEY_SCALE_MAX

const CLINICAL = ['OT', 'PT', 'SLP', 'SPED', 'PSYCHOLOGY'] as const
/** Patient-facing survey forms. HR12 rates admin, so it is not one of these. */
const PATIENT_FORMS = ['HR10', 'HR11', 'HR16'] as const

export interface Contender {
  staffId: string
  name: string
  branch: string
  department: string
  /** The figure the award is decided on — a rating out of 5, or a session count. */
  score: number
  /** How many surveys / evaluations / sessions that figure rests on. */
  responses: number
  qualified: boolean
  /** Why not, when not. */
  reason: string | null
}

export interface AwardResult {
  key: string
  title: string
  /** 'rating' awards need MIN_RESPONSES; 'sessions' awards do not. */
  basis: 'rating' | 'sessions'
  unit: string
  winners: Contender[]
  runnersUp: Contender[]
  excluded: Contender[]
  /** Said plainly on the card when the category cannot be decided. */
  note: string | null
}

/**
 * One survey's rating, as a number out of 5.
 *
 * Averaged WITHIN the response first. The forms do not all ask the same number
 * of questions — 8, 9, 10 and 12 all appear in 2026 — so pooling every rating
 * item would let a twelve-question response outvote an eight-question one by
 * half again. One family, one voice.
 *
 * Returns null for a response with no usable ratings rather than a zero, which
 * would drag an average down as though someone had scored bottom marks.
 */
function responseRating(json: unknown): number | null {
  const r = json as { ratings?: unknown } | null
  const items = Array.isArray(r?.ratings) ? r!.ratings as unknown[] : []
  const values: number[] = []
  for (const it of items) {
    const v = (it as { value?: unknown })?.value
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n) && n > 0 && n <= SCALE_MAX) values.push(n)
  }
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** One peer evaluation's score, out of 5. Flat object of q1..qN. */
function evalScore(scores: unknown): number | null {
  if (!scores || typeof scores !== 'object') return null
  const values: number[] = []
  for (const v of Object.values(scores as Record<string, unknown>)) {
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n) && n > 0 && n <= SCALE_MAX) values.push(n)
  }
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

const nameOf = (s: { firstName: string; lastName: string }) =>
  `${s.lastName}, ${s.firstName}`.trim()

/**
 * Rank contenders into winners / runners-up / excluded.
 *
 * Ties are returned as joint winners rather than broken arbitrarily. A tie on
 * a rating is real — two people can be equally well thought of — and inventing
 * a tiebreak (who has more responses, who is alphabetically first) would hand
 * somebody an award on a rule nobody agreed.
 */
interface Ranked {
  winners: Contender[]
  runnersUp: Contender[]
  excluded: Contender[]
  note: string | null
}

function rank(contenders: Contender[], basis: 'rating' | 'sessions'): Ranked {
  const eligible = contenders.filter(c => c.qualified)
  const excluded = contenders.filter(c => !c.qualified)
    .sort((a, b) => b.responses - a.responses || a.name.localeCompare(b.name))

  if (eligible.length === 0) {
    return {
      winners: [], runnersUp: [], excluded,
      note: basis === 'rating'
        ? `Nobody has reached ${MIN_RESPONSES} responses yet, so this award cannot be decided.`
        : 'No sessions recorded for this year yet.',
    }
  }

  const sorted = [...eligible].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  // Compared at the precision the page shows, so two people displayed as 4.85
  // are treated as tied rather than separated by a digit nobody can see.
  const top = basis === 'rating' ? Number(sorted[0].score.toFixed(2)) : sorted[0].score
  const same = (c: Contender) => (basis === 'rating' ? Number(c.score.toFixed(2)) : c.score) === top
  const winners = sorted.filter(same)
  const runnersUp = sorted.filter(c => !same(c)).slice(0, 4)

  return {
    winners, runnersUp, excluded,
    note: winners.length > 1 ? `${winners.length} joint winners — the scores are level.` : null,
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Main admin only, and enforced HERE rather than only on the route.
  //
  // The page gate in (dashboard)/layout.tsx stops the page rendering; it does
  // nothing about a branch admin who knows the URL of this endpoint. The
  // figures are the sensitive part — every colleague's rating, and a list of
  // who fell short — so the gate has to be where the figures are.
  const role = (session.user as { role?: string } | undefined)?.role ?? ''
  if (role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const yearRaw = Number(req.nextUrl.searchParams.get('year'))
  const year = Number.isInteger(yearRaw) && yearRaw >= 2020 && yearRaw <= 2100
    ? yearRaw : new Date().getFullYear()
  const from = new Date(`${year}-01-01T00:00:00.000Z`)
  const to = new Date(`${year + 1}-01-01T00:00:00.000Z`)

  // Everyone who could be in contention. Interns are excluded for the same
  // reason they are excluded from utilisation: their hours are supervised
  // teaching, not the clinic's own service.
  const staff = await prisma.staff.findMany({
    where: { active: true, OR: [{ employmentType: null }, { employmentType: { not: 'intern' } }] },
    select: { id: true, firstName: true, lastName: true, branch: true, department: true },
  })
  const byId = new Map(staff.map(s => [s.id, s]))

  // ── Patient ratings, per clinician ────────────────────────────────────────
  const surveys = await prisma.surveyResponse.findMany({
    where: { submittedAt: { gte: from, lt: to }, surveyType: { in: [...PATIENT_FORMS] as SurveyType[] } },
    select: { staffId: true, responsesJson: true },
  })
  const patientAgg = new Map<string, { sum: number; n: number }>()
  for (const s of surveys) {
    const v = responseRating(s.responsesJson)
    if (v === null) continue
    const a = patientAgg.get(s.staffId) ?? { sum: 0, n: 0 }
    a.sum += v; a.n += 1
    patientAgg.set(s.staffId, a)
  }

  // ── Peer evaluations, per assessee ────────────────────────────────────────
  const evals = await prisma.peerEvalResponse.findMany({
    where: { submittedAt: { gte: from, lt: to } },
    select: { assesseeId: true, scores: true },
  })
  const peerAgg = new Map<string, { sum: number; n: number }>()
  for (const e of evals) {
    const v = evalScore(e.scores)
    if (v === null) continue
    const a = peerAgg.get(e.assesseeId) ?? { sum: 0, n: 0 }
    a.sum += v; a.n += 1
    peerAgg.set(e.assesseeId, a)
  }

  // ── Confirmed sessions, per clinician ─────────────────────────────────────
  const sessions = await prisma.schedule.groupBy({
    by: ['staffId'],
    where: { status: 'CONFIRMED', date: { gte: from, lt: to } },
    _count: { _all: true },
  })
  const sessionCount = new Map(sessions.map(s => [s.staffId, s._count._all]))

  /** A rating award over one department (or admin), across both branches. */
  function ratingAward(
    key: string, title: string, match: (s: typeof staff[number]) => boolean,
    agg: Map<string, { sum: number; n: number }>, unit: string,
  ): AwardResult {
    const contenders: Contender[] = staff.filter(match).map(s => {
      const a = agg.get(s.id) ?? { sum: 0, n: 0 }
      const score = a.n > 0 ? a.sum / a.n : 0
      return {
        staffId: s.id, name: nameOf(s), branch: s.branch, department: s.department,
        score, responses: a.n,
        qualified: a.n >= MIN_RESPONSES,
        reason: a.n >= MIN_RESPONSES ? null
          : a.n === 0 ? 'no responses yet'
          : `${a.n} of ${MIN_RESPONSES} responses`,
      }
    })
    return { key, title, basis: 'rating', unit, ...rank(contenders, 'rating') }
  }

  /** A session-count award for one branch. No response threshold — see the header. */
  function sessionsAward(key: string, title: string, branch: string): AwardResult {
    const contenders: Contender[] = staff
      .filter(s => s.branch === branch && (CLINICAL as readonly string[]).includes(s.department))
      .map(s => {
        const n = sessionCount.get(s.id) ?? 0
        return {
          staffId: s.id, name: nameOf(s), branch: s.branch, department: s.department,
          score: n, responses: n,
          // Everyone with at least one session is in contention. Somebody who
          // ran no sessions has not won a sessions award, but that is not an
          // exclusion worth listing beside "needs more surveys".
          qualified: n > 0,
          reason: n > 0 ? null : 'no confirmed sessions this year',
        }
      })
    return { key, title, basis: 'sessions', unit: 'sessions', ...rank(contenders, 'sessions') }
  }

  const isClinical = (d: string) => (CLINICAL as readonly string[]).includes(d)

  const awards: AwardResult[] = [
    ratingAward('admin-peer', 'Admin staff with Highest Peer Rating (Across Branches)',
      s => s.department === ('ADMINISTRATION' as StaffDepartment), peerAgg, 'out of 5'),
    sessionsAward('sessions-east', 'Clinician with Most Sessions for the Year (East)', 'SBEA'),
    sessionsAward('sessions-gh', 'Clinician with Most Sessions for the Year (Greenhills)', 'SBGH'),
    ...(['PT', 'OT', 'SLP', 'SPED', 'PSYCHOLOGY'] as const).map(dept =>
      ratingAward(`rating-${dept.toLowerCase()}`,
        `${dept === 'PSYCHOLOGY' ? 'PSYCH' : dept} with Highest Patient Rating (Across Branches)`,
        s => s.department === (dept as StaffDepartment) && isClinical(s.department),
        patientAgg, 'out of 5')),
  ]

  return NextResponse.json({
    year,
    minResponses: MIN_RESPONSES,
    awards,
    // So the page can say how far off the whole thing is without each card
    // having to work it out.
    summary: {
      decided: awards.filter(a => a.winners.length > 0).length,
      total: awards.length,
      staffConsidered: byId.size,
    },
  })
}
