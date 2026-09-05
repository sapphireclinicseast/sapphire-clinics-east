import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN'].includes(role))
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const { assignmentId, scores, strengths, improvements } = await req.json()
  if (!assignmentId || !scores) return NextResponse.json({ error: 'assignmentId and scores required' }, { status: 400 })

  const assignment = await prisma.peerEvalAssignment.findUnique({
    where: { id: assignmentId },
    include: { assessor: true, assessee: true },
  })
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  const response = await prisma.peerEvalResponse.create({
    data: {
      assignmentId,
      assessorId: assignment.assessorId,
      assesseeId: assignment.assesseeId,
      formType: assignment.formType,
      branch: assignment.branch,
      scores,
      strengths: strengths || null,
      improvements: improvements || null,
    },
  })

  await prisma.peerEvalAssignment.update({
    where: { id: assignmentId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })

  return NextResponse.json(response)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN'].includes(role))
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const assesseeId = searchParams.get('assesseeId')
  const formType = searchParams.get('formType') as any
  const branch = searchParams.get('branch')
  const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : undefined

  // Answered-between. Overrides the year when given, so "was anything answered
  // this week" can be asked directly rather than inferred from a year's worth
  // of rows. Either bound works on its own.
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const hasFrom = DATE_RE.test(from)
  const hasTo = DATE_RE.test(to)

  const submittedWindow = hasFrom || hasTo
    ? {
        submittedAt: {
          ...(hasFrom ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
          // Exclusive bound on the day AFTER `to`, so the last day counts whole
          // rather than stopping at its own midnight.
          ...(hasTo ? { lt: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000) } : {}),
        },
      }
    : year !== undefined
      ? { submittedAt: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) } }
      : {}

  const responses = await prisma.peerEvalResponse.findMany({
    where: {
      ...(assesseeId ? { assesseeId } : {}),
      ...(formType ? { formType } : {}),
      ...(branch ? { branch } : {}),
      ...submittedWindow,
    },
    include: {
      assessor: { select: { id: true, firstName: true, lastName: true, department: true } },
      assessee: { select: { id: true, firstName: true, lastName: true, department: true } },
    },
    orderBy: { submittedAt: 'desc' },
  })

  return NextResponse.json(responses)
}
