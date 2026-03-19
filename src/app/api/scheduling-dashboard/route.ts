import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = ['ADMIN', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'MARKETING_ADMIN']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string })?.role ?? ''
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const status = searchParams.get('status') // 'all' | 'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'RESCHEDULED'
  const branch = searchParams.get('branch') // 'all' | 'SBEA' | 'SBGH' | 'Verdana'
  const departments = searchParams.get('departments') // comma-separated: 'OT,PT,SLP,...'

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })
  }

  const dayStart = new Date(`${startDate}T00:00:00.000Z`)
  const dayEnd = new Date(`${endDate}T23:59:59.999Z`)

  // Build where clause
  const where: Record<string, unknown> = {
    date: { gte: dayStart, lte: dayEnd },
  }
  if (status && status !== 'all') {
    where.status = status
  }

  // Branch + department filtering via staff relation
  const staffWhere: Record<string, unknown> = {}
  if (branch && branch !== 'all') {
    staffWhere.branch = branch
  }
  if (departments && departments !== 'all') {
    const deptList = departments.split(',').map(d => d.trim()).filter(Boolean)
    if (deptList.length > 0) {
      staffWhere.department = { in: deptList }
    }
  }
  if (Object.keys(staffWhere).length > 0) {
    where.staff = staffWhere
  }

  // Fetch all matching schedules with staff info
  const schedules = await prisma.schedule.findMany({
    where,
    include: {
      staff: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          department: true,
          branch: true,
        },
      },
    },
    orderBy: { date: 'asc' },
  })

  // Get unique staff count for the filtered set
  const staffIds = new Set(schedules.map(s => s.staffId))

  return NextResponse.json({
    schedules: schedules.map(s => ({
      id: s.id,
      date: s.date.toISOString().split('T')[0],
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      sessionType: s.sessionType,
      staffName: `${s.staff.lastName}, ${s.staff.firstName}`,
      department: s.staff.department,
      branch: s.staff.branch,
    })),
    totalSessions: schedules.length,
    uniqueStaffCount: staffIds.size,
  })
}
