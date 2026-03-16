import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { keepId, deleteId } = await req.json()
  if (!keepId || !deleteId)
    return NextResponse.json({ error: 'keepId and deleteId required' }, { status: 400 })
  if (keepId === deleteId)
    return NextResponse.json({ error: 'keepId and deleteId must be different' }, { status: 400 })

  await prisma.$transaction(async (tx) => {
    // Reassign schedules
    await tx.schedule.updateMany({ where: { staffId: deleteId }, data: { staffId: keepId } })

    // Reassign survey assignments
    await tx.surveyAssignment.updateMany({ where: { staffId: deleteId }, data: { staffId: keepId } })

    // Reassign survey responses
    await tx.surveyResponse.updateMany({ where: { staffId: deleteId }, data: { staffId: keepId } })

    // AssessmentTarget has @@unique([staffId, year]) — merge carefully
    const deleteTargets = await tx.assessmentTarget.findMany({ where: { staffId: deleteId } })
    for (const target of deleteTargets) {
      const existing = await tx.assessmentTarget.findFirst({
        where: { staffId: keepId, year: target.year },
      })
      if (existing) {
        await tx.assessmentTarget.update({
          where: { id: existing.id },
          data: {
            targetCount: existing.targetCount + target.targetCount,
            completed:   existing.completed   + target.completed,
          },
        })
        await tx.assessmentTarget.delete({ where: { id: target.id } })
      } else {
        await tx.assessmentTarget.update({
          where: { id: target.id },
          data: { staffId: keepId },
        })
      }
    }

    // Safe to delete now — all FK references have been reassigned
    await tx.staff.delete({ where: { id: deleteId } })
  })

  return NextResponse.json({ ok: true })
}
