/**
 * GET /api/peer-eval/notifications?branch=SBEA
 *
 * Returns staff members who:
 *   1. Have at least one CONFIRMED schedule today (they are physically in the clinic)
 *   2. Have at least one PENDING peer evaluation assignment as assessor
 *
 * Front desk can use this list to prompt clinicians to fill out their peer eval forms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch')

  // Today's date range (Philippine time is handled by TZ=Asia/Manila in docker)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

  // 1. Distinct staff with CONFIRMED schedules today
  const confirmedSchedules = await prisma.schedule.findMany({
    where: {
      status: 'CONFIRMED',
      date: { gte: todayStart, lte: todayEnd },
      ...(branch ? { staff: { branch } } : {}),
    },
    select: {
      staffId: true,
      staff: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
    },
    distinct: ['staffId'],
  })

  if (confirmedSchedules.length === 0) return NextResponse.json([])

  const staffIds = confirmedSchedules.map(s => s.staffId)

  // 2. Among those, find who has PENDING peer eval assignments as assessor
  const pendingCounts = await prisma.peerEvalAssignment.groupBy({
    by: ['assessorId'],
    where: {
      assessorId: { in: staffIds },
      status: 'PENDING',
    },
    _count: { id: true },
  })

  if (pendingCounts.length === 0) return NextResponse.json([])

  const pendingMap = new Map(pendingCounts.map(p => [p.assessorId, p._count.id]))

  // Build result: only staff who appear in both sets
  const result = confirmedSchedules
    .filter(s => pendingMap.has(s.staffId))
    .map(s => ({
      staffId:      s.staffId,
      name:         `${s.staff.firstName} ${s.staff.lastName}`,
      department:   s.staff.department,
      branch:       s.staff.branch,
      pendingCount: pendingMap.get(s.staffId) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json(result)
}
