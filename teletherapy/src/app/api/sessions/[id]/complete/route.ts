import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isNoteAgeLocked, NOTE_AGE_LOCK_MESSAGE } from '@/lib/note-age-lock'

// Append-only note audit trail. Each entry records who touched the note and
// when (interns author; supervisors edit), so both are visible.
function appendHistory(
  existing: unknown,
  entry: { name: string; accountType: string; action: 'created' | 'edited'; at: string },
): Prisma.InputJsonValue {
  const arr = Array.isArray(existing) ? existing : []
  return [...arr, entry] as unknown as Prisma.InputJsonValue
}

export async function POST(
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

  if (session.user.role !== 'ADMIN') {
    const allowedStaffIds = (session.user.branches ?? []).map((b: any) => b.staffId)
    const isSupervisor = allowedStaffIds.includes(schedule.staffId) || schedule.staffId === session.user.staffId
    // The assigned intern also writes the note for their own session — the
    // supervisor sees it afterward on their own schedule, no separate access needed.
    const isAssignedIntern = !!schedule.internStaffId && schedule.internStaffId === session.user.staffId
    if (!isSupervisor && !isAssignedIntern) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // If we'd be mutating an existing note, refuse if it's locked.
    if (schedule.sessionNote?.lockedAt) {
      return NextResponse.json(
        { error: 'This note is locked and cannot be modified.' },
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

  // If a session note already exists (e.g. created by QR capture), update it
  // Merge new attachments with existing ones from QR capture
  if (schedule.sessionNote) {
    const existingAttachments = Array.isArray(schedule.sessionNote.attachments)
      ? (schedule.sessionNote.attachments as any[])
      : []
    const newAttachments = Array.isArray(body.attachments) ? body.attachments : []

    // Merge: keep existing (from QR capture) + add new (from file upload)
    const mergedAttachments = [...existingAttachments, ...newAttachments]

    const note = await prisma.sessionNote.update({
      where: { id: schedule.sessionNote.id },
      data: {
        status: 'COMPLETED',
        notes: body.notes || schedule.sessionNote.notes || null,
        attachments: mergedAttachments.length > 0 ? (mergedAttachments as any) : undefined,
        therapistAccountId: session.user.id,
        editHistory: appendHistory(schedule.sessionNote.editHistory, {
          name: session.user.name ?? session.user.email ?? 'Staff',
          accountType: session.user.accountType ?? 'CLINICIAN',
          action: Array.isArray(schedule.sessionNote.editHistory) && schedule.sessionNote.editHistory.length > 0 ? 'edited' : 'created',
          at: new Date().toISOString(),
        }),
        ...(body.isInitialEvaluation === true ? { isInitialEvaluation: true } : {}),
        ...(body.sharedWithOthers !== undefined ? { sharedWithOthers: body.sharedWithOthers === true } : {}),
      },
    })

    return NextResponse.json({ note })
  }

  // No existing note — create new
  const note = await prisma.sessionNote.create({
    data: {
      scheduleId: id,
      therapistAccountId: session.user.id,
      status: 'COMPLETED',
      notes: body.notes || null,
      attachments: body.attachments || null,
      isInitialEvaluation: body.isInitialEvaluation === true,
      sharedWithOthers: body.sharedWithOthers === true,
      editHistory: appendHistory(null, {
        name: session.user.name ?? session.user.email ?? 'Staff',
        accountType: session.user.accountType ?? 'CLINICIAN',
        action: 'created',
        at: new Date().toISOString(),
      }),
    },
  })

  return NextResponse.json({ note })
}
