// GET /api/scheduling-dashboard/slot-utilization?from=YYYY-MM&to=YYYY-MM&branch=&departments=
//
// Slots per calendar month, for the Slot Utilization line on Clinic
// Utilization. The page's own charts are day-grained over a short window; this
// answers the different question of whether the clinic is running more or
// fewer sessions than it was, month on month, over a year or more.
//
// A "slot" here is a booked session — a Schedule row. Decking slots cannot
// answer this: that board is a WEEKLY TEMPLATE keyed on day-of-week, with no
// date and no history, so it knows what capacity looks like today and nothing
// about what it looked like in March.
//
// CANCELLED is excluded by default. A cancelled session is not a slot the
// clinic ran, and counting it would make a month of cancellations look like
// growth. NO_SHOW is counted: the slot was held, staffed and lost, which is
// exactly the kind of thing this line should not hide. Pass
// includeCancelled=1 to count everything instead.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchForRole } from '@/lib/role-branch'

// Same list as the parent route — INVESTOR is deliberately absent.
const ALLOWED_ROLES = ['ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'MARKETING_ADMIN']

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
// A guard, not a preference: the chart is unreadable past a few years and an
// unbounded range invites a scan of the whole table.
const MAX_MONTHS = 60

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string })?.role ?? ''
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  if (!MONTH_RE.test(from) || !MONTH_RE.test(to)) {
    return NextResponse.json({ error: 'from and to are required as YYYY-MM' }, { status: 400 })
  }
  if (from > to) {
    return NextResponse.json({ error: 'from must not be after to' }, { status: 400 })
  }

  // Branch is OVERRIDDEN by role, never merely validated — a branch-scoped
  // account calling this route directly with another branch's code gets its
  // own. Same rule as the parent route; this endpoint would otherwise be a way
  // around it.
  const scopedBranch = branchForRole(role)
  const branch = scopedBranch ?? searchParams.get('branch')
  const departments = searchParams.get('departments')
  const includeCancelled = searchParams.get('includeCancelled') === '1'

  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const monthCount = (ty - fy) * 12 + (tm - fm) + 1
  if (monthCount > MAX_MONTHS) {
    return NextResponse.json({ error: `Range too long — ${MAX_MONTHS} months maximum.` }, { status: 400 })
  }

  const rangeStart = new Date(Date.UTC(fy, fm - 1, 1))
  // Exclusive upper bound on the first of the month AFTER `to`, so the last
  // month is whole however many days it has — a fixed +31 would spill.
  const rangeEnd = new Date(Date.UTC(tm === 12 ? ty + 1 : ty, tm === 12 ? 0 : tm, 1))

  const staffWhere: Record<string, unknown> = { active: true }
  if (branch && branch !== 'all') staffWhere.branch = branch
  const deptList = departments && departments !== 'all'
    ? departments.split(',').map(d => d.trim()).filter(Boolean)
    : []
  if (deptList.length > 0) staffWhere.department = { in: deptList }

  const where: Record<string, unknown> = {
    date: { gte: rangeStart, lt: rangeEnd },
    staff: staffWhere,
  }
  if (!includeCancelled) where.status = { not: 'CANCELLED' }

  // Only the date is needed — pulling whole rows for a multi-year range would
  // move a lot of data to count it.
  const rows = await prisma.schedule.findMany({
    where,
    select: { date: true },
  })

  const counts = new Map<string, number>()
  for (const r of rows) {
    const d = r.date
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  // Every month in range is emitted, including empty ones. A month with no
  // sessions is a real and interesting reading; dropping it would silently
  // close the gap and draw a straight line over a shutdown.
  const points: { month: string; label: string; slots: number; delta: number | null; pctChange: number | null }[] = []
  let prev: number | null = null
  for (let i = 0; i < monthCount; i++) {
    const y = fy + Math.floor((fm - 1 + i) / 12)
    const m = ((fm - 1 + i) % 12) + 1
    const key = `${y}-${String(m).padStart(2, '0')}`
    const slots = counts.get(key) ?? 0
    points.push({
      month: key,
      label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      slots,
      delta: prev === null ? null : slots - prev,
      // Growth from zero has no percentage — reporting one would be a
      // divide-by-zero dressed up as a number.
      pctChange: prev === null || prev === 0 ? null : ((slots - prev) / prev) * 100,
    })
    prev = slots
  }

  const total = points.reduce((s, p) => s + p.slots, 0)
  const first = points[0]?.slots ?? 0
  const last = points[points.length - 1]?.slots ?? 0

  return NextResponse.json({
    points,
    total,
    monthCount,
    // Net movement across the whole window, which is the question the filters
    // are usually being pointed at.
    netChange: points.length > 1 ? last - first : null,
    netPctChange: points.length > 1 && first > 0 ? ((last - first) / first) * 100 : null,
    branch: branch ?? 'all',
    branchLocked: !!scopedBranch,
    includeCancelled,
  })
}
