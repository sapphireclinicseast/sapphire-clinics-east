// GET /api/decking/history?branch=&department=&from=&to=
//
// The recorded daily readings, for the History chart. Filled and open stack to
// the total slots the consultants offered that day.
//
// Only what was actually written is returned. There is no reconstruction of
// days before snapshotting began: the board keeps no dated record, so any
// earlier curve would be invented.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchForRole } from '@/lib/role-branch'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''

  // Branch is overridden by role, not validated — same rule as every other
  // branch-scoped read here, so this cannot be a way around it.
  const scoped = branchForRole(role)
  const branch = scoped ?? (req.nextUrl.searchParams.get('branch') || '')
  const department = req.nextUrl.searchParams.get('department') || ''
  const from = req.nextUrl.searchParams.get('from') || ''
  const to = req.nextUrl.searchParams.get('to') || ''

  const where: Record<string, unknown> = {}
  if (branch && branch !== 'all') where.branch = branch
  if (department && department !== 'all') where.department = department
  if (from || to) {
    const range: Record<string, Date> = {}
    if (from) range.gte = new Date(`${from}T00:00:00.000Z`)
    if (to) range.lte = new Date(`${to}T23:59:59.999Z`)
    where.date = range
  }

  const rows = await prisma.deckingSnapshot.findMany({
    where,
    orderBy: { date: 'asc' },
    select: { date: true, branch: true, department: true, totalSlots: true, booked: true, blocked: true, open: true },
  })

  // Sum across whatever the filters left — several departments, or both
  // branches — so one day is one point on the chart.
  const byDate = new Map<string, { date: string; totalSlots: number; booked: number; blocked: number; open: number }>()
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10)
    const cur = byDate.get(key) ?? { date: key, totalSlots: 0, booked: 0, blocked: 0, open: 0 }
    cur.totalSlots += r.totalSlots
    cur.booked += r.booked
    cur.blocked += r.blocked
    cur.open += r.open
    byDate.set(key, cur)
  }

  const points = [...byDate.values()].map(p => ({
    ...p,
    label: new Date(`${p.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    fillRate: p.totalSlots > 0 ? Math.round((p.booked / p.totalSlots) * 100) : null,
  }))

  const departments = [...new Set(rows.map(r => r.department))].sort()

  return NextResponse.json({
    points,
    departments,
    // Named so the UI can say "history starts here" rather than implying the
    // clinic had no slots before the first snapshot.
    firstRecorded: points[0]?.date ?? null,
    branchLocked: !!scoped,
  })
}
