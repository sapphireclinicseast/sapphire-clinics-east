import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()

  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: { sessionNote: true },
  })

  if (!schedule) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (!schedule.sessionNote) {
    return NextResponse.json({ error: 'No note to edit' }, { status: 400 })
  }

  if (session.user.role !== 'ADMIN') {
    const allowedStaffIds = (session.user.branches ?? []).map((b: any) => b.staffId)
    if (!allowedStaffIds.includes(schedule.staffId) && schedule.staffId !== session.user.staffId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // Locked notes are permanently read-only. lockedAt is stamped when
    // the author is endorsed/discharged off the patient and never
    // clears, so this rejection holds even if the patient is later
    // endorsed back to the same clinician.
    if (schedule.sessionNote.lockedAt) {
      return NextResponse.json(
        { error: 'This note is locked. Notes become read-only after the author is endorsed or discharged off the patient.' },
        { status: 403 },
      )
    }
  }

  const updateData: Record<string, unknown> = {}

  if (body.notes !== undefined) {
    updateData.notes = body.notes || null
  }

  if (body.existingAttachments !== undefined || body.attachments !== undefined) {
    // existingAttachments = the kept subset of old attachments (after deletions)
    // attachments = newly uploaded attachments to append
    const kept = body.existingAttachments ?? (schedule.sessionNote.attachments as any[] | null) ?? []
    const added = body.attachments ?? []
    updateData.attachments = [...kept, ...added]
  }

  if (body.discontinuedRemarks !== undefined) {
    updateData.discontinuedRemarks = body.discontinuedRemarks || null
  }

  // Reset email sent status when notes are edited (so they can re-send)
  if (body.notes !== undefined || body.attachments !== undefined) {
    updateData.emailSentAt = null
    updateData.emailSentTo = null
  }

  const note = await prisma.sessionNote.update({
    where: { id: schedule.sessionNote.id },
    data: updateData,
  })

  return NextResponse.json({ note })
}
