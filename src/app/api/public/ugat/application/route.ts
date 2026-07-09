// Scholar's own application (Part I / Initial).
//   GET   → { application, uploadKinds }
//   PUT   → save draft (partial ok). Body: { answers?, truthAffirmed? }
//   POST  → submit Part I (validates all steps present + a signature upload)
// Char limit per Step-1 answer: QUESTION_MAX.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest } from '@/lib/ugat-auth'
import { getWindow } from '@/lib/ugat-cycle'

export const dynamic = 'force-dynamic'

export const QUESTION_MAX = 1500
const Q_FIELDS = [
  'q1WhyApply', 'q2Initiatives', 'q3WhyProgram', 'q4StipendUse',
  'q5ReturnService', 'q6ArawNgKalinga', 'q7FiveYearPlan',
] as const

async function scholarId(req: Request): Promise<string | null> {
  const tok = await tokenFromRequest(req)
  return tok && tok.role === 'SCHOLAR' && tok.scholarId ? tok.scholarId : null
}

function cleanAnswers(input: Record<string, unknown> | undefined) {
  const out: Record<string, string> = {}
  if (!input) return out
  for (const f of Q_FIELDS) {
    if (typeof input[f] === 'string') out[f] = (input[f] as string).slice(0, QUESTION_MAX)
  }
  return out
}

export async function GET(req: Request) {
  const sid = await scholarId(req)
  if (!sid) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  const application = await prisma.ugatApplication.findUnique({ where: { scholarId: sid } })
  const uploads = await prisma.ugatUpload.findMany({ where: { scholarId: sid }, select: { id: true, kind: true } })
  const uploadKinds = uploads.reduce<Record<string, string>>((m, u) => { m[u.kind] = u.id; return m }, {})
  return NextResponse.json({ application, uploadKinds })
}

export async function PUT(req: Request) {
  const sid = await scholarId(req)
  if (!sid) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  let body: { answers?: Record<string, unknown>; truthAffirmed?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }

  const existing = await prisma.ugatApplication.findUnique({ where: { scholarId: sid }, select: { submittedAt: true } })
  if (existing?.submittedAt) return NextResponse.json({ error: 'Your application has already been submitted.' }, { status: 409 })

  if (!(await getWindow()).open) return NextResponse.json({ error: 'Applications are currently closed.' }, { status: 403 })

  const data = { ...cleanAnswers(body.answers), ...(typeof body.truthAffirmed === 'boolean' ? { truthAffirmed: body.truthAffirmed } : {}) }
  await prisma.ugatApplication.upsert({ where: { scholarId: sid }, create: { scholarId: sid, ...data }, update: data })
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request) {
  const sid = await scholarId(req)
  if (!sid) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  let body: { answers?: Record<string, unknown>; truthAffirmed?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }

  const existing = await prisma.ugatApplication.findUnique({ where: { scholarId: sid }, select: { submittedAt: true } })
  if (existing?.submittedAt) return NextResponse.json({ error: 'Your application has already been submitted.' }, { status: 409 })

  const win = await getWindow()
  if (!win.open) return NextResponse.json({ error: 'Applications are currently closed.' }, { status: 403 })

  const answers = cleanAnswers(body.answers)
  for (const f of Q_FIELDS) {
    if (!answers[f] || !answers[f].trim()) {
      return NextResponse.json({ error: 'Please answer every question in Step 1 before submitting.' }, { status: 400 })
    }
  }
  if (!body.truthAffirmed) {
    return NextResponse.json({ error: 'Please tick the truthfulness statement in Step 4.' }, { status: 400 })
  }

  const uploads = await prisma.ugatUpload.findMany({ where: { scholarId: sid }, select: { kind: true } })
  const kinds = new Set(uploads.map((u) => u.kind))
  const missing: string[] = []
  if (!kinds.has('LETTER')) missing.push('the motivational letter (Step 2)')
  for (const y of ['GRADES_Y1', 'GRADES_Y2', 'GRADES_Y3']) {
    if (!kinds.has(y)) missing.push(`proof of grades for Year ${y.slice(-1)} (Step 3)`)
  }
  if (!kinds.has('SIGNATURE')) missing.push('your signature (Step 4)')
  if (missing.length) {
    return NextResponse.json({ error: `Please complete: ${missing.join(', ')}.` }, { status: 400 })
  }

  const stamp = { ...answers, truthAffirmed: true, signedAt: new Date(), submittedAt: new Date(), academicYear: win.academicYear || null }
  await prisma.ugatApplication.upsert({
    where: { scholarId: sid },
    create: { scholarId: sid, ...stamp },
    update: stamp,
  })
  return NextResponse.json({ ok: true, submitted: true, academicYear: win.academicYear })
}
