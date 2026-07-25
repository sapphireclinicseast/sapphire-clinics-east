import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { scheduleBranchWhere } from '@/lib/branch-filter'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const dateStr = searchParams.get('date')
  const requestedStaffId = searchParams.get('staffId') // For interbranch clinicians

  if (!dateStr) {
    return NextResponse.json({ error: 'Date parameter required' }, { status: 400 })
  }

  // Build date range for the entire day
  const startOfDay = new Date(dateStr + 'T00:00:00.000Z')
  const endOfDay = new Date(dateStr + 'T23:59:59.999Z')

  const isAdmin = session.user.role === 'ADMIN'

  // Determine which staffId to use
  let effectiveStaffId = session.user.staffId
  if (requestedStaffId && !isAdmin) {
    // Validate the requested staffId is in the user's allowed branches
    const allowedStaffIds = (session.user.branches ?? []).map((b) => b.staffId)
    if (allowedStaffIds.includes(requestedStaffId)) {
      effectiveStaffId = requestedStaffId
    }
  }

  // Merged interbranch consultants share one staffId; when the switcher sends
  // a patientBranch, scope by the patient's branch instead. (Legacy per-branch
  // consultants never send it, so their behaviour is unchanged.)
  const requestedBranch = (searchParams.get('patientBranch') ?? '').trim()
  const branchWhere = requestedBranch
    ? scheduleBranchWhere(requestedBranch, session.user.branch ?? '')
    : {}

  const schedules = await prisma.schedule.findMany({
    where: {
      date: {
        gte: startOfDay,
        lte: endOfDay,
      },
      status: 'CONFIRMED',
      // Non-admin users only see their own sessions (for the selected branch)
      ...(isAdmin ? {} : { staffId: effectiveStaffId }),
      ...branchWhere,
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
    take: 200,
  })

  return NextResponse.json({ sessions: schedules })
}
