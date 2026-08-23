// POST /api/sessions/[id]/note-lock  { unlocked: boolean }
//
// Re-opens (or re-closes) documentation on a session that has aged past the
// documentation window — see @/lib/note-age-lock.
//
// The decision is stored on the Schedule rather than kept in the browser so
// the write routes can enforce it. Re-locking is offered too: a clinician who
// opened a note by mistake shouldn't have to leave it open.
//
// This has NOTHING to do with SessionNote.lockedAt, the permanent freeze
// stamped at endorsement/discharge. That one stays shut for everyone; this
// route will not clear it and the write routes check it first.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isPastNoteWindow } from '@/lib/note-age-lock'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const unlocked = body?.unlocked !== false   // default to opening

  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: { sessionNote: true },
  })
  if (!schedule) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.user.role !== 'ADMIN') {
    const allowedStaffIds = (session.user.branches ?? []).map((b: { staffId: string }) => b.staffId)
    const isSupervisor =
      allowedStaffIds.includes(schedule.staffId) || schedule.staffId === session.user.staffId
    const isAssignedIntern =
      !!schedule.internStaffId && schedule.internStaffId === session.user.staffId
    if (!isSupervisor && !isAssignedIntern) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // A permanently frozen note must not be re-openable by this route — that
    // would turn the endorsement freeze into a suggestion.
    if (schedule.sessionNote?.lockedAt) {
      return NextResponse.json(
        { error: 'This note is signed and permanently read-only. It cannot be re-opened.' },
        { status: 403 },
      )
    }
  }

  // Nothing to open on a session still inside the window — say so rather than
  // recording a meaningless unlock.
  if (unlocked && !isPastNoteWindow(schedule.date)) {
    return NextResponse.json({ error: 'This session is still within the editing window.' }, { status: 400 })
  }

  const updated = await prisma.schedule.update({
    where: { id },
    data: unlocked
      ? { noteUnlockedAt: new Date(), noteUnlockedById: session.user.id }
      : { noteUnlockedAt: null, noteUnlockedById: null },
    select: { noteUnlockedAt: true, noteUnlockedById: true },
  })

  console.log(
    `[note-lock] ${unlocked ? 're-opened' : 're-locked'} session ${id} by ${session.user.id}`,
  )
  return NextResponse.json({ ok: true, ...updated })
}
