// POST /api/sessions/[id]/share  { shared: boolean }
// Psychology / Medical (MD) confidentiality toggle. Sets sharedWithOthers on
// the session's note — true lets other departments AND the patient (Client Hub)
// see it; false keeps it confidential. Only the note's author or an admin may
// change it, and only for a completed note in a confidential department.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const CONFIDENTIAL_DEPTS = ['PSYCHOLOGY', 'MD']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isAdmin = session.user.role === 'ADMIN'
  const { id } = await params

  let body: { shared?: unknown } = {}
  try { body = await req.json() } catch { /* handled below */ }
  const shared = body.shared === true

  const schedule = await prisma.schedule.findUnique({
    where: { id },
    select: {
      staff: { select: { department: true } },
      sessionNote: { select: { id: true, therapistAccountId: true } },
    },
  })
  if (!schedule?.sessionNote) return NextResponse.json({ error: 'No completed note for this session.' }, { status: 404 })

  const dept = (schedule.staff?.department ?? '').toUpperCase()
  if (!CONFIDENTIAL_DEPTS.includes(dept)) {
    // Non-confidential departments are always visible — nothing to toggle.
    return NextResponse.json({ error: 'This department’s notes are already visible.' }, { status: 400 })
  }
  if (!isAdmin && schedule.sessionNote.therapistAccountId !== session.user.id) {
    return NextResponse.json({ error: 'Only the note’s author can change this.' }, { status: 403 })
  }

  await prisma.sessionNote.update({ where: { id: schedule.sessionNote.id }, data: { sharedWithOthers: shared } })
  return NextResponse.json({ ok: true, sharedWithOthers: shared })
}
