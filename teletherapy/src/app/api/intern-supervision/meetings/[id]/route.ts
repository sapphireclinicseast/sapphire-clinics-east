// DELETE /api/intern-supervision/meetings/[id] — cancel a meeting.
// Allowed for the creator or an admin.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const u = session.user as unknown as { id: string; role?: string }
  const { id } = await params

  const m = await prisma.supervisionMeeting.findUnique({ where: { id }, select: { createdByAccountId: true } })
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (m.createdByAccountId !== u.id && u.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the organizer can cancel this meeting.' }, { status: 403 })
  }

  await prisma.supervisionMeeting.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
