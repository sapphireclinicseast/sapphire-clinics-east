import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          dob: true,
        },
      },
      staff: {
        select: {
          firstName: true,
          lastName: true,
          department: true,
        },
      },
      sessionNote: true,
    },
  })

  if (!schedule) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Non-admin can only view their own sessions
  if (session.user.role !== 'ADMIN' && schedule.staffId !== session.user.staffId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ session: schedule })
}
