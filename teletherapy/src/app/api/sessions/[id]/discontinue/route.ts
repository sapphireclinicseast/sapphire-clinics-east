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

  if (!body.remarks?.trim()) {
    return NextResponse.json({ error: 'Remarks are required' }, { status: 400 })
  }

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

  if (session.user.role !== 'ADMIN') {
    const allowedStaffIds = (session.user.branches ?? []).map((b: any) => b.staffId)
    if (!allowedStaffIds.includes(schedule.staffId) && schedule.staffId !== session.user.staffId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const note = await prisma.sessionNote.create({
    data: {
      scheduleId: id,
      therapistAccountId: session.user.id,
      status: 'DISCONTINUED',
      discontinuedRemarks: body.remarks,
    },
  })

  return NextResponse.json({ note })
}
