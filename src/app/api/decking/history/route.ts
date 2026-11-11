// GET /api/decking/history?branch=&department=&from=&to=
//
// The recorded daily readings, for the History tab. Filled and open stack to
// the total slots the consultants offered that day.
//
// Returns the same readings twice, because the tab asks two questions of them:
//   points        — summed across the filters, one entry per day, for the chart
//   perDepartment — the same days split by department, for the day-on-day table
// Both are built from one query and share one list of days (`columns`), so the
// chart and the table can never disagree about what was recorded when.
//
// Only what was actually written is returned. There is no reconstruction of
// days before snapshotting began: the board keeps no dated record, so any
// earlier curve would be invented.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchForRole } from '@/lib/role-branch'
import { computeDeckingSnapshot } from '@/lib/decking-snapshot'

/** One day's figures for one department. */
interface Reading { totalSlots: number; booked: number; blocked: number; open: number }
const EMPTY_READING: Reading = { totalSlots: 0, booked: 0, blocked: 0, open: 0 }
const addReading = (a: Reading, b: Reading): Reading => ({
  totalSlots: a.totalSlots + b.totalSlots, booked: a.booked + b.booked,
  blocked: a.blocked + b.blocked, open: a.open + b.open,
})

// The order departments are listed in, everywhere in this module.
const DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS'] as const

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

  // The same days, kept split by department, for the table under the chart.
  // Both branches land in the same cell when the caller asked for both, which
  // is what "all" means everywhere else here.
  const deptByDate = new Map<string, Map<string, Reading>>()
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10)
    const forDate = deptByDate.get(key) ?? new Map<string, Reading>()
    forDate.set(r.department, addReading(forDate.get(r.department) ?? EMPTY_READING, {
      totalSlots: r.totalSlots, booked: r.booked, blocked: r.blocked, open: r.open,
    }))
    deptByDate.set(key, forDate)
  }

  // ── Today is read from the board, not from this morning's row ────────────
  // History is meant to follow the board: put a name in and the filled count
  // should move. The stored row for today was written by the 23:50 cron, so
  // until this it showed yesterday's shape all day and every change front desk
  // made was invisible until the next night.
  //
  // Computed live and substituted in, rather than written — the cron still owns
  // what gets frozen for the day, so a reload cannot rewrite an earlier day.
  //
  // Wrapped, because today is a convenience and the recorded days behind it are
  // the point: computeDeckingSnapshot reads across the whole board, so one bad
  // row there used to take the entire History tab down with it rather than
  // costing it its last column. (The weekly table guarded this; the chart's own
  // endpoint did not.)
  const todayKey = new Date().toISOString().slice(0, 10)
  const wantsToday = (!to || to >= todayKey) && (!from || from <= todayKey)
  if (wantsToday) {
    const live = await computeDeckingSnapshot().catch(() => [])
    const mine = live.filter(r =>
      (!branch || branch === 'all' || r.branch === branch) &&
      (!department || department === 'all' || r.department === department))
    if (mine.length > 0) {
      byDate.set(todayKey, mine.reduce((acc, r) => ({
        date: todayKey,
        totalSlots: acc.totalSlots + r.totalSlots,
        booked: acc.booked + r.booked,
        blocked: acc.blocked + r.blocked,
        open: acc.open + r.open,
      }), { date: todayKey, totalSlots: 0, booked: 0, blocked: 0, open: 0 }))

      // Today's per-department split is replaced wholesale, not merged: the
      // stored row and the live board are two readings of the same day, and
      // adding them would double it.
      const liveDepts = new Map<string, Reading>()
      for (const r of mine) {
        liveDepts.set(r.department, addReading(liveDepts.get(r.department) ?? EMPTY_READING, {
          totalSlots: r.totalSlots, booked: r.booked, blocked: r.blocked, open: r.open,
        }))
      }
      deptByDate.set(todayKey, liveDepts)
    }
  }

  const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map(p => ({
    ...p,
    label: new Date(`${p.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    // Of what could be sold, how much was sold — so blocked hours are out of
    // the denominator. They were in it, which punished a department for hours
    // its consultants never offered: East SLP read 19% while 34% of its
    // sellable hours were filled.
    //
    // Deliberately a different basis from the board's Slots card, which shows
    // "% of total" and says so on the tile. Same numbers, two questions: that
    // card asks how the day breaks down, this asks how well we sold it.
    fillRate: (p.booked + p.open) > 0
      ? Math.round((p.booked / (p.booked + p.open)) * 100)
      : null,
  }))

  // Every department that appears on any day in range, in the module's order
  // rather than alphabetically, so the table's rows don't reshuffle when a
  // department's first reading lands.
  const seen = new Set<string>()
  for (const forDate of deptByDate.values()) for (const d of forDate.keys()) seen.add(d)
  const departments = [
    ...DEPARTMENTS.filter(d => seen.has(d)),
    // Anything the enum here has not caught up with still gets a row.
    ...[...seen].filter(d => !DEPARTMENTS.includes(d as typeof DEPARTMENTS[number])).sort(),
  ]

  // One list of days, shared by the chart and the table. Only days with a
  // reading: a calendar run of empty columns would suggest the clinic had no
  // slots then, when in fact nobody was recording yet.
  const columns = points.map(p => ({ date: p.date, label: p.label }))

  return NextResponse.json({
    points,
    columns,
    departments,
    // null where no reading was taken that day — the UI shows a blank cell
    // rather than a zero, because "nobody recorded it" and "there were none"
    // are different facts and only one of them is true.
    perDepartment: departments.map(dept => ({
      department: dept,
      readings: columns.map(c => deptByDate.get(c.date)?.get(dept) ?? null),
    })),
    // Named so the UI can say "history starts here" rather than implying the
    // clinic had no slots before the first snapshot.
    firstRecorded: points[0]?.date ?? null,
    branchLocked: !!scoped,
  })
}
