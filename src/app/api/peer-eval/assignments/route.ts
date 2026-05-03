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

  const assignments = await prisma.peerEvalAssignment.findMany({
    where: {
      ...(formType ? { formType } : {}),
      ...(branch ? { branch } : {}),
      ...(year !== undefined ? { periodYear: year } : {}),
      ...(month !== undefined ? { periodMonth: month } : {}),
      ...(status ? { status } : {}),
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
