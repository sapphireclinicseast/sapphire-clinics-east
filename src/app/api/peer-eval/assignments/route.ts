import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const formType = searchParams.get('formType') as any
  const branch = searchParams.get('branch')
  const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : undefined
  const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : undefined
  const status = searchParams.get('status') as any

  // Answered-between, on the RESPONSE's submittedAt. periodYear/periodMonth
  // describe the evaluation period, which is a different question from "when
  // was this actually answered" — an August evaluation can be answered in
  // October, and checking for recent activity means the latter.
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const hasFrom = DATE_RE.test(from)
  const hasTo = DATE_RE.test(to)
  // An assignment with no response has no answer date, so it cannot fall in the
  // window — asking "what came in this week" should not return blanks.
  const answeredWhere = hasFrom || hasTo
    ? {
        response: {
          is: {
            submittedAt: {
              ...(hasFrom ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
              // Exclusive bound on the day after `to`, so the last day is whole.
              ...(hasTo ? { lt: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86400000) } : {}),
            },
          },
        },
      }
    : {}

  const assignments = await prisma.peerEvalAssignment.findMany({
    where: {
      ...(formType ? { formType } : {}),
      ...(branch ? { branch } : {}),
      ...(year !== undefined ? { periodYear: year } : {}),
      ...(month !== undefined ? { periodMonth: month } : {}),
      ...(status ? { status } : {}),
      ...answeredWhere,
    },
    include: {
      assessor: { select: { id: true, firstName: true, lastName: true, department: true } },
      assessee: { select: { id: true, firstName: true, lastName: true, department: true } },
      response: { select: { id: true, scores: true, strengths: true, improvements: true, submittedAt: true } },
    },
    orderBy: [{ assessee: { lastName: 'asc' } }, { assessor: { lastName: 'asc' } }],
  })

  return NextResponse.json(assignments)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN'].includes(role))
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const { formType, assessorId, assesseeId, branch, periodYear, periodMonth } = await req.json()
  if (!formType || !assessorId || !assesseeId || !branch || !periodYear)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const assignment = await prisma.peerEvalAssignment.create({
    data: { formType, assessorId, assesseeId, branch, periodYear, periodMonth: periodMonth ?? 0 },
    include: {
      assessor: { select: { id: true, firstName: true, lastName: true, department: true } },
      assessee: { select: { id: true, firstName: true, lastName: true, department: true } },
    },
  })
  return NextResponse.json(assignment)
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN'].includes(role))
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const { id } = await req.json()
  await prisma.peerEvalAssignment.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
