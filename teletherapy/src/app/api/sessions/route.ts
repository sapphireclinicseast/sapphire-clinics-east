import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const dateStr = searchParams.get('date')

  if (!dateStr) {
    return NextResponse.json({ error: 'Date parameter required' }, { status: 400 })
  }

  // Build date range for the entire day
  const startOfDay = new Date(dateStr + 'T00:00:00.000Z')
  const endOfDay = new Date(dateStr + 'T23:59:59.999Z')

  const isAdmin = session.user.role === 'ADMIN'

  const schedules = await prisma.schedule.findMany({
    where: {
      date: {
        gte: startOfDay,
        lte: endOfDay,
      },
      status: 'CONFIRMED',
      // Non-admin users only see their own sessions
      ...(isAdmin ? {} : { staffId: session.user.staffId }),
    },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      staff: {
        select: {
          firstName: true,
          lastName: true,
          department: true,
        },
      },
      sessionNote: {
        select: {
          id: true,
          status: true,
        },
      },
    },
    orderBy: { startTime: 'asc' },
  })

  return NextResponse.json({ sessions: schedules })
}
