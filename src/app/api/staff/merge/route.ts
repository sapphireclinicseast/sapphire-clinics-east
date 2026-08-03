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

    // DeckingSlot/DeckingTherapistConfig have onDelete: Cascade on staffId, and
    // this route never reassigned them — a merge would silently destroy the
    // losing record's entire Decking weekly-schedule + patient-slot history the
    // moment tx.staff.delete ran below. Found while investigating a separate
    // incident (an interbranch clinician's config header got overwritten by a
    // different bug); this route had never actually been exercised on a staff
    // member with Decking data, so nothing was lost by it yet — closing the gap
    // before it is.
    await tx.deckingSlot.updateMany({ where: { staffId: deleteId }, data: { staffId: keepId } })

    // DeckingTherapistConfig has @@unique([staffId, branch]) — merge per branch.
    // If keepId already has a config for a given branch, that survivor's config
    // wins (its content is presumably current/live) and the deleteId's config
    // for that same branch is simply dropped by the cascade delete below —
    // otherwise reassign so keepId ends up with configs for every branch
    // deleteId used to cover.
    const deleteConfigs = await tx.deckingTherapistConfig.findMany({ where: { staffId: deleteId } })
    for (const cfg of deleteConfigs) {
      const existing = await tx.deckingTherapistConfig.findFirst({
        where: { staffId: keepId, branch: cfg.branch },
      })
      if (!existing) {
        await tx.deckingTherapistConfig.update({
          where: { id: cfg.id },
          data: { staffId: keepId },
        })
      }
    }

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
