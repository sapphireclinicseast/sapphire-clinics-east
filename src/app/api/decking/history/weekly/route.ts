// The board week by week, one reading per week, per department.
//
//   GET /api/decking/history/weekly?branch=SBEA&weekday=0&weeks=12
//
// The charts answer "what has the shape been"; this answers "is it up or down
// on last week, and by how much" — which is the question actually asked at a
// Monday meeting, and the one a stacked area chart is worst at.
//
// A reading is taken once a day, so a week is represented by the reading on
// ONE named weekday. Which weekday is the caller's choice: a clinic that
// counts its week from Sunday and one that counts from Monday are both right,
// and a figure taken on a different day of the week is not comparable.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchForRole } from '@/lib/role-branch'
import { computeDeckingSnapshot } from '@/lib/decking-snapshot'

export const dynamic = 'force-dynamic'

const DEPARTMENTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY'] as const

interface Reading { total: number; booked: number; blocked: number; open: number }
const EMPTY: Reading = { total: 0, booked: 0, blocked: 0, open: 0 }
const add = (a: Reading, b: Reading): Reading => ({
  total: a.total + b.total, booked: a.booked + b.booked,
  blocked: a.blocked + b.blocked, open: a.open + b.open,
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''

  // Branch is overridden by role, never validated from the query — the same
  // rule as every other branch-scoped read, so this cannot be a way around it.
  const scoped = branchForRole(role)
  const branch = scoped ?? (req.nextUrl.searchParams.get('branch') || '')

  const weekdayRaw = Number(req.nextUrl.searchParams.get('weekday'))
  const weekday = Number.isInteger(weekdayRaw) && weekdayRaw >= 0 && weekdayRaw <= 6 ? weekdayRaw : 1
  const weeksRaw = Number(req.nextUrl.searchParams.get('weeks'))
  const weeks = Number.isInteger(weeksRaw) && weeksRaw >= 2 && weeksRaw <= 104 ? weeksRaw : 12

  // A week of slack, so the first column still has a previous week to be
  // compared against rather than showing a change of "+everything".
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - (weeks + 1) * 7)

  const rows = await prisma.deckingSnapshot.findMany({
    where: {
      ...(branch && branch !== 'all' ? { branch } : {}),
      date: { gte: since },
    },
    select: { date: true, department: true, totalSlots: true, booked: true, blocked: true, open: true },
    orderBy: { date: 'asc' },
  })

  // date → department → reading. Both branches land in the same cell when the
  // caller asked for both, which is what "all" means everywhere else here.
  const byDate = new Map<string, Map<string, Reading>>()
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10)
    const forDate = byDate.get(key) ?? new Map<string, Reading>()
    forDate.set(r.department, add(forDate.get(r.department) ?? EMPTY, {
      total: r.totalSlots, booked: r.booked, blocked: r.blocked, open: r.open,
    }))
    byDate.set(key, forDate)
  }

  // The chosen weekday, counting back from the most recent one that has passed.
  const today = new Date()
  const todayKey = today.toISOString().slice(0, 10)
  const anchor = new Date(`${todayKey}T00:00:00.000Z`)
  while (anchor.getUTCDay() !== weekday) anchor.setUTCDate(anchor.getUTCDate() - 1)

  const columns: { date: string; label: string }[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(anchor)
    d.setUTCDate(d.getUTCDate() - i * 7)
    const key = d.toISOString().slice(0, 10)
    columns.push({
      date: key,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    })
  }

  // Today, read from the board rather than from last night's row — the same
  // substitution the daily chart makes, so the live column agrees with it.
  let live: Record<string, Reading> | null = null
  try {
    const now = await computeDeckingSnapshot()
    const mine = now.filter(r => !branch || branch === 'all' || r.branch === branch)
    if (mine.length > 0) {
      live = {}
      for (const r of mine) {
        live[r.department] = add(live[r.department] ?? EMPTY, {
          total: r.totalSlots, booked: r.booked, blocked: r.blocked, open: r.open,
        })
      }
    }
  } catch {
    // A live column is a convenience; the weeks behind it are the point.
    live = null
  }

  const present = new Set(rows.map(r => r.department))
  const departments = DEPARTMENTS.filter(d => present.has(d) || (live && live[d]))

  const body = {
    weekday,
    weeks,
    columns,
    departments,
    // null where no reading was taken that day — shown as a blank cell rather
    // than as a zero, because "nobody recorded it" and "there were none" are
    // different facts and only one of them is true.
    cells: departments.map(dept => ({
      department: dept,
      readings: columns.map(c => byDate.get(c.date)?.get(dept) ?? null),
      live: live?.[dept] ?? null,
    })),
    totals: {
      readings: columns.map(c => {
        const forDate = byDate.get(c.date)
        if (!forDate) return null
        return [...forDate.values()].reduce(add, EMPTY)
      }),
      live: live ? Object.values(live).reduce(add, EMPTY) : null,
    },
  }
  return NextResponse.json(body)
}
