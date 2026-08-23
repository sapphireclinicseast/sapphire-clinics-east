import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isNoteAgeLocked, NOTE_AGE_LOCK_MESSAGE } from '@/lib/note-age-lock'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: { sessionNote: true },
  })

  if (!schedule) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (!schedule.sessionNote) {
    return NextResponse.json({ error: 'No note to delete' }, { status: 400 })
  }

  if (session.user.role !== 'ADMIN') {
    const allowedStaffIds = (session.user.branches ?? []).map((b: any) => b.staffId)
    if (!allowedStaffIds.includes(schedule.staffId) && schedule.staffId !== session.user.staffId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // Locked notes can't be deleted either — same rule as edit.
    if (schedule.sessionNote.lockedAt) {
      return NextResponse.json(
        { error: 'This note is locked and cannot be deleted.' },
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

  await prisma.sessionNote.delete({
    where: { id: schedule.sessionNote.id },
  })

  return NextResponse.json({ success: true })
}
