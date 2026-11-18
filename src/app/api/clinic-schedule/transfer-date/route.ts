import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchForRole } from '@/lib/role-branch'

// Branch lock, via the shared helper.
//
// This used to test role.startsWith('SBEA_') inline. The Role enum is
// AHEA_*/AHGH_*, so that matched NOTHING: the lock returned null for every
// real account and this route ran unscoped for years. branchForRole knows
// both spellings — always use it rather than writing the prefix out again.
function branchFromRole(role: string): string | null {
  return branchForRole(role)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { fromDate, toDate } = await req.json()
  if (!fromDate || !toDate)
    return NextResponse.json({ error: 'fromDate and toDate are required' }, { status: 400 })
  if (fromDate === toDate)
    return NextResponse.json({ error: 'fromDate and toDate must be different' }, { status: 400 })

  const role   = (session.user as { role?: string }).role ?? ''
  const branch = branchFromRole(role)

  const fromStart = new Date(`${fromDate}T00:00:00.000Z`)
  const fromEnd   = new Date(`${fromDate}T23:59:59.999Z`)
  const toNewDate = new Date(`${toDate}T00:00:00.000Z`)

  // Find schedules on fromDate scoped to branch (or all if admin)
  const schedules = await prisma.schedule.findMany({
    where: {
      date: { gte: fromStart, lte: fromEnd },
      ...(branch ? { staff: { branch } } : {}),
    },
    select: { id: true },
  })

  if (schedules.length === 0)
    return NextResponse.json({ transferred: 0 })

  const ids = schedules.map(s => s.id)

  await prisma.schedule.updateMany({
    where: { id: { in: ids } },
    data:  { date: toNewDate },
  })

  console.log(`[transfer-date] ${fromDate} → ${toDate} | ${ids.length} schedules | branch=${branch ?? 'ALL'}`)
  return NextResponse.json({ transferred: ids.length })
}
