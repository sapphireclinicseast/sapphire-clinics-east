import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

  if (schedule.sessionNote) {
    return NextResponse.json({ error: 'Session already has a note' }, { status: 400 })
  }

  if (session.user.role !== 'ADMIN' && schedule.staffId !== session.user.staffId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const note = await prisma.sessionNote.create({
    data: {
      scheduleId: id,
      therapistAccountId: session.user.id,
      status: 'COMPLETED',
      notes: body.notes || null,
      attachments: body.attachments || null,
    },
  })

  return NextResponse.json({ note })
}
