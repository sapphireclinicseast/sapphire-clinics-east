// Per-assessor scores + remarks for an applicant at a stage (INITIAL | INTERVIEW).
//   GET  ?scholarId=&stage=  → MAIN: every assessor's scores + weighted overall.
//                              STAFF assessor: their own scores + whether they
//                              may score (assigned to the year) and if it's locked.
//   POST { scholarId, stage, data } → a Staff-Admin assessor saves their own.
//
// Locking: once the stage has a decision (INITIAL → initialDecision set, or
// INTERVIEW → interviewDecision set), scoring is frozen (view-only).

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, canViewAdmin } from '@/lib/ugat-auth'
import { DEFAULT_RUBRIC, normalizeRubric, initialScore, interviewScore, stepBreakdown, weightedOverall, type AssessmentData, type RubricConfig } from '@/lib/ugat-rubric'

export const dynamic = 'force-dynamic'

const STAGES = ['INITIAL', 'INTERVIEW'] as const
type Stage = (typeof STAGES)[number]

async function getRubric(): Promise<RubricConfig> {
  const row = await prisma.ugatRubric.findUnique({ where: { key: 'default' } })
  return row ? normalizeRubric(row.config) : DEFAULT_RUBRIC
}

function stageScore(stage: Stage, data: AssessmentData, rubric: RubricConfig): number | null {
  return stage === 'INITIAL' ? initialScore(data, rubric) : interviewScore(data, rubric)
}

// A stage is locked once a decision has been made for it (applicant moved on).
function isLocked(stage: Stage, initialDecision?: string | null, interviewDecision?: string | null): boolean {
  const d = stage === 'INITIAL' ? initialDecision : interviewDecision
  return !!d && d !== 'PENDING'
}

export async function GET(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !canViewAdmin(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  const url = new URL(req.url)
  const scholarId = url.searchParams.get('scholarId') || ''
  const stage = (url.searchParams.get('stage') || 'INITIAL') as Stage
  if (!scholarId || !STAGES.includes(stage)) return NextResponse.json({ error: 'scholarId and a valid stage are required.' }, { status: 400 })

  const scholar = await prisma.ugatScholar.findUnique({ where: { id: scholarId }, select: { application: { select: { academicYear: true, initialDecision: true, interviewDecision: true } } } })
  const academicYear = scholar?.application?.academicYear || ''
  const locked = isLocked(stage, scholar?.application?.initialDecision, scholar?.application?.interviewDecision)
  const rubric = await getRubric()

  if (tok.role === 'MAIN_ADMIN') {
    const [rows, assessors, staff] = await Promise.all([
      prisma.ugatAssessment.findMany({ where: { scholarId, stage } }),
      academicYear ? prisma.ugatAssessor.findMany({ where: { academicYear } }) : Promise.resolve([]),
      prisma.ugatAdmin.findMany({ where: { kind: 'STAFF' }, select: { id: true, name: true } }),
    ])
    const nameById = new Map(staff.map((s) => [s.id, s.name]))
    const weightById = new Map(assessors.map((a) => [a.adminId, a.weightPercent]))
    const rowByAdmin = new Map(rows.map((r) => [r.adminId, r]))
    // One entry per assigned assessor (so missing scores are visible), plus any
    // stray scores from assessors no longer assigned.
    const adminIds = new Set<string>([...assessors.map((a) => a.adminId), ...rows.map((r) => r.adminId)])
    const entries = Array.from(adminIds).map((adminId) => {
      const row = rowByAdmin.get(adminId)
      const data = (row?.data as AssessmentData) || {}
      const score = row ? stageScore(stage, data, rubric) : null
      return {
        adminId,
        name: nameById.get(adminId) || '(removed staff)',
        weight: weightById.get(adminId) ?? 0,
        assigned: weightById.has(adminId),
        submitted: !!row,
        score,
        breakdown: stage === 'INITIAL' ? stepBreakdown(data, rubric) : undefined,
        remarks: data.remarks || {},
        data,
      }
    }).sort((a, b) => b.weight - a.weight)
    const overall = weightedOverall(entries.map((e) => ({ score: e.score, weight: e.weight })))
    return NextResponse.json({ role: 'main', academicYear, stage, locked, rubric, overall, entries })
  }

  // Staff assessor — only their own.
  const assigned = tok.adminId ? !!(await prisma.ugatAssessor.findUnique({ where: { adminId_academicYear: { adminId: tok.adminId, academicYear } } }).catch(() => null)) : false
  const mine = tok.adminId ? await prisma.ugatAssessment.findUnique({ where: { scholarId_adminId_stage: { scholarId, adminId: tok.adminId, stage } } }).catch(() => null) : null
  const data = (mine?.data as AssessmentData) || null
  return NextResponse.json({ role: 'assessor', academicYear, stage, locked, assigned, rubric, mine: data, myScore: data ? stageScore(stage, data, rubric) : null })
}

export async function POST(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || tok.role !== 'STAFF_ADMIN' || !tok.adminId) {
    return NextResponse.json({ error: 'Only an assigned assessor can submit scores.' }, { status: 403 })
  }
  let body: { scholarId?: string; stage?: string; data?: AssessmentData }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const scholarId = String(body.scholarId || '')
  const stage = body.stage as Stage
  if (!scholarId || !STAGES.includes(stage)) return NextResponse.json({ error: 'scholarId and a valid stage are required.' }, { status: 400 })

  const scholar = await prisma.ugatScholar.findUnique({ where: { id: scholarId }, select: { application: { select: { academicYear: true, initialDecision: true, interviewDecision: true } } } })
  const academicYear = scholar?.application?.academicYear || ''
  if (!academicYear) return NextResponse.json({ error: 'This applicant has no submitted application yet.' }, { status: 400 })
  const assigned = await prisma.ugatAssessor.findUnique({ where: { adminId_academicYear: { adminId: tok.adminId, academicYear } } }).catch(() => null)
  if (!assigned) return NextResponse.json({ error: `You are not assigned as an assessor for A.Y. ${academicYear}.` }, { status: 403 })
  if (isLocked(stage, scholar?.application?.initialDecision, scholar?.application?.interviewDecision)) {
    return NextResponse.json({ error: 'This applicant has already moved to the next stage — scoring is now view-only.' }, { status: 409 })
  }

  // Sanitize: clamp criterion scores to 0–5, grades to 0–100, remarks length.
  const raw = body.data || {}
  const clampScores = (o: unknown): Record<string, number> => {
    const out: Record<string, number> = {}
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const n = Number(v); if (!Number.isNaN(n)) out[String(k).slice(0, 40)] = Math.max(0, Math.min(5, Math.round(n)))
    }
    return out
  }
  const clampGrades = (o: unknown): Record<string, number> => {
    const out: Record<string, number> = {}
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const n = Number(v); if (!Number.isNaN(n) && v !== '' && v !== null) out[String(k).slice(0, 20)] = Math.max(0, Math.min(100, n))
    }
    return out
  }
  const clampRemarks = (o: unknown): Record<string, string> => {
    const out: Record<string, string> = {}
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[String(k).slice(0, 40)] = v.slice(0, 4000)
    }
    return out
  }
  const scores = raw.scores || {}
  const data: AssessmentData = {
    scores: stage === 'INITIAL'
      ? { step1: clampScores(scores.step1), step2: clampScores(scores.step2), step3: { grades: clampGrades(scores.step3?.grades) } }
      : { interview: clampScores(scores.interview) },
    remarks: clampRemarks(raw.remarks),
  }

  await prisma.ugatAssessment.upsert({
    where: { scholarId_adminId_stage: { scholarId, adminId: tok.adminId, stage } },
    create: { scholarId, adminId: tok.adminId, academicYear, stage, data: data as object },
    update: { academicYear, data: data as object },
  })
  return NextResponse.json({ ok: true })
}
