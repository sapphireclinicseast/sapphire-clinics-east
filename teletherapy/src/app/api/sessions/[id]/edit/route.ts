import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isNoteAgeLocked, NOTE_AGE_LOCK_MESSAGE } from '@/lib/note-age-lock'

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
    const isSupervisor = allowedStaffIds.includes(schedule.staffId) || schedule.staffId === session.user.staffId
    const isAssignedIntern = !!schedule.internStaffId && schedule.internStaffId === session.user.staffId
    if (!isSupervisor && !isAssignedIntern) {
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
    // Age lock — documentation for a session this old is read-only until the
    // clinician deliberately re-opens it. Checked after the permanent
    // endorsement lock above, which is never re-openable.
    if (isNoteAgeLocked(schedule)) {
      return NextResponse.json({ error: NOTE_AGE_LOCK_MESSAGE, ageLocked: true }, { status: 403 })
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

  // Psychology/MD "Show to Others" toggle (confidentiality opt-in).
  if (body.sharedWithOthers !== undefined) {
    updateData.sharedWithOthers = body.sharedWithOthers === true
  }

  // Reset email sent status when notes are edited (so they can re-send)
  if (body.notes !== undefined || body.attachments !== undefined) {
    updateData.emailSentAt = null
    updateData.emailSentTo = null
  }

  // Record this edit in the note's history — a supervisor editing an intern's
  // note shows alongside the intern's original authoring.
  updateData.editHistory = [
    ...(Array.isArray(schedule.sessionNote.editHistory) ? schedule.sessionNote.editHistory : []),
    {
      name: session.user.name ?? session.user.email ?? 'Staff',
      accountType: session.user.accountType ?? 'CLINICIAN',
      action: 'edited',
      at: new Date().toISOString(),
    },
  ]

  const note = await prisma.sessionNote.update({
    where: { id: schedule.sessionNote.id },
    data: updateData,
  })

  return NextResponse.json({ note })
}
