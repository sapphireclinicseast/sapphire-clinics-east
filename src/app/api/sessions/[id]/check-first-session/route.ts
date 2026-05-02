import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
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
    select: { patientId: true, staffId: true },
  })

  if (!schedule?.patientId) {
    return NextResponse.json({ isFirstSession: true })
  }

  // Check if there are any completed session notes for this patient with this staff
  const previousNotes = await prisma.sessionNote.findFirst({
    where: {
      schedule: {
        patientId: schedule.patientId,
        staffId: schedule.staffId,
        id: { not: id },
      },
      status: 'COMPLETED',
    },
  })

  return NextResponse.json({ isFirstSession: !previousNotes })
}
