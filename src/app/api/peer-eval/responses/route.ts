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

  const responses = await prisma.peerEvalResponse.findMany({
    where: {
      ...(assesseeId ? { assesseeId } : {}),
      ...(formType ? { formType } : {}),
      ...(branch ? { branch } : {}),
      ...(year !== undefined ? { submittedAt: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) } } : {}),
    },
    include: {
      assessor: { select: { id: true, firstName: true, lastName: true, department: true } },
      assessee: { select: { id: true, firstName: true, lastName: true, department: true } },
    },
    orderBy: { submittedAt: 'desc' },
  })

  return NextResponse.json(responses)
}
