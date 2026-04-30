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

  if (session.user.role !== 'ADMIN') {
    const allowedStaffIds = (session.user.branches ?? []).map((b: any) => b.staffId)
    if (!allowedStaffIds.includes(schedule.staffId) && schedule.staffId !== session.user.staffId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
        ...(body.isInitialEvaluation === true ? { isInitialEvaluation: true } : {}),
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
    },
  })

  return NextResponse.json({ note })
}
