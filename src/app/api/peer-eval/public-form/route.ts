/**
 * Public peer eval form API — no NextAuth required.
 * Used by /peereval page (accessible to assessors without login).
 *
 * GET  /api/peer-eval/public-form?branch=SBEA
 *   → Returns list of staff who have at least one PENDING assignment as assessor
 *
 * GET  /api/peer-eval/public-form?staffId=xxx
 *   → Returns pending assignments for this assessor
 *
 * POST /api/peer-eval/public-form
 *   { assignmentId, scores, strengths?, improvements? }
 *   → Creates PeerEvalResponse, marks assignment COMPLETED
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const branch  = searchParams.get('branch')
  const staffId = searchParams.get('staffId')

  // Return staff with pending assignments (for name picker)
  if (branch && !staffId) {
    const rows = await prisma.peerEvalAssignment.findMany({
      where: {
        status: 'PENDING',
        branch,
      },
      select: {
        assessorId: true,
        assessor: { select: { id: true, firstName: true, lastName: true, department: true } },
      },
      distinct: ['assessorId'],
    })

    const staff = rows
      .map(r => r.assessor)
      .sort((a, b) => a.lastName.localeCompare(b.lastName))

    return NextResponse.json(staff)
  }

  // Return pending assignments for a specific assessor
  if (staffId) {
    const assignments = await prisma.peerEvalAssignment.findMany({
      where: { assessorId: staffId, status: 'PENDING' },
      include: {
        assessor: { select: { id: true, firstName: true, lastName: true, department: true } },
        assessee: { select: { id: true, firstName: true, lastName: true, department: true } },
      },
      orderBy: [{ formType: 'asc' }, { assessee: { lastName: 'asc' } }],
    })
    return NextResponse.json(assignments)
  }

  return NextResponse.json({ error: 'Provide branch or staffId' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const { assignmentId, scores, strengths, improvements } = await req.json()

  if (!assignmentId || !scores)
    return NextResponse.json({ error: 'assignmentId and scores required' }, { status: 400 })

  const assignment = await prisma.peerEvalAssignment.findUnique({
    where: { id: assignmentId },
  })
  if (!assignment)
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  if (assignment.status === 'COMPLETED')
    return NextResponse.json({ error: 'Already completed' }, { status: 409 })

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

  return NextResponse.json({ ok: true, responseId: response.id })
}
