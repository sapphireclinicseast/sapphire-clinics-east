import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ── POST /api/customer-survey/assignment/[id]/submit — Public, no auth ───────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const assignment = await prisma.surveyAssignment.findUnique({
    where: { id },
    include: { response: true },
  })

  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  if (assignment.response) {
    return NextResponse.json({ error: 'This survey has already been submitted' }, { status: 410 })
  }

  if (assignment.status === 'EXPIRED') {
    return NextResponse.json({ error: 'This survey has expired' }, { status: 410 })
  }

  const { responses, respondentName, respondentEmail, respondentPhone } = await req.json()

  if (!responses) {
    return NextResponse.json({ error: 'responses is required' }, { status: 400 })
  }

  const now = new Date()
  const year = now.getFullYear()

  // Transaction: create response + update assignment + update assessment target
  await prisma.$transaction(async (tx) => {
    // Create response
    await tx.surveyResponse.create({
      data: {
        assignmentId: id,
        staffId: assignment.staffId,
        surveyType: assignment.surveyType,
        branch: assignment.branch,
        respondentName: respondentName ?? null,
        respondentEmail: respondentEmail ?? null,
        respondentPhone: respondentPhone ?? null,
        responsesJson: responses,
      },
    })

    // Mark assignment completed
    await tx.surveyAssignment.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: now },
    })

    // Upsert assessment target
    await tx.assessmentTarget.upsert({
      where: { staffId_year: { staffId: assignment.staffId, year } },
      create: { staffId: assignment.staffId, year, targetCount: 10, completed: 1 },
      update: { completed: { increment: 1 } },
    })
  })

  return NextResponse.json({ success: true, message: 'Survey response submitted successfully' })
}
