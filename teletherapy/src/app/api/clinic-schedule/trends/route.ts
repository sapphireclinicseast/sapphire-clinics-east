import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/clinic-schedule/trends?department=all|<DEPT>&staffId=all|<id>&year=all|<yyyy>
// Admin-only. Returns a session-count time series (per-year when year=all,
// per-month when a single year is chosen) plus the filter option lists.
// A "session" is any non-cancelled, non-rescheduled schedule row, counted
// against the owning clinician (staffId) and their department.

const COUNTED_STATUSES = ['PENDING', 'CONFIRMED', 'COMPLETED'] as const

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const department = (searchParams.get('department') ?? 'all').trim()
  const staffId = (searchParams.get('staffId') ?? 'all').trim()
  const yearRaw = (searchParams.get('year') ?? 'all').trim()
  const year = /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null

  // WHERE fragments, composed under AND.
  const conds: Prisma.Sql[] = [
    Prisma.sql`s."status"::text IN (${Prisma.join([...COUNTED_STATUSES])})`,
  ]
  if (department && department !== 'all') conds.push(Prisma.sql`st."department"::text = ${department}`)
  if (staffId && staffId !== 'all') conds.push(Prisma.sql`s."staffId" = ${staffId}`)
  if (year) conds.push(Prisma.sql`EXTRACT(YEAR FROM s."date") = ${year}`)
  const where = Prisma.join(conds, ' AND ')

  // Per-month within a chosen year; per-year across the whole history.
  const grain = year ? 'month' : 'year'
  const fmt = year ? 'YYYY-MM' : 'YYYY'

  const seriesRows = await prisma.$queryRaw<{ period: string; count: number }[]>(Prisma.sql`
    SELECT to_char(date_trunc(${grain}, s."date"), ${fmt}) AS period, COUNT(*)::int AS count
    FROM "Schedule" s
    JOIN "Staff" st ON st.id = s."staffId"
    WHERE ${where}
    GROUP BY 1
    ORDER BY 1
  `)

  // Fill gaps so the line is continuous.
  const series = year ? fillMonths(year, seriesRows) : fillYears(seriesRows)
  const total = seriesRows.reduce((n, r) => n + Number(r.count), 0)

  // Filter option lists (only clinicians/departments/years that have sessions).
  const [deptRows, clinicianRows, yearRows] = await Promise.all([
    prisma.$queryRaw<{ department: string }[]>(Prisma.sql`
      SELECT DISTINCT st."department"::text AS department
      FROM "Staff" st WHERE EXISTS (SELECT 1 FROM "Schedule" s WHERE s."staffId" = st.id)
      ORDER BY 1`),
    prisma.$queryRaw<{ id: string; name: string; department: string }[]>(Prisma.sql`
      SELECT st.id, (st."firstName" || ' ' || st."lastName") AS name, st."department"::text AS department
      FROM "Staff" st WHERE EXISTS (SELECT 1 FROM "Schedule" s WHERE s."staffId" = st.id)
      ORDER BY st."lastName", st."firstName"`),
    prisma.$queryRaw<{ year: number }[]>(Prisma.sql`
      SELECT DISTINCT EXTRACT(YEAR FROM s."date")::int AS year FROM "Schedule" s ORDER BY 1 DESC`),
  ])

  return NextResponse.json({
    series,
    total,
    grain,
    filters: {
      departments: deptRows.map((r) => r.department),
      clinicians: clinicianRows,
      years: yearRows.map((r) => Number(r.year)),
    },
  })
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fillMonths(year: number, rows: { period: string; count: number }[]) {
  const map = new Map(rows.map((r) => [r.period, Number(r.count)]))
  return Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`
    return { period: key, label: MONTH_ABBR[i], count: map.get(key) ?? 0 }
  })
}

function fillYears(rows: { period: string; count: number }[]) {
  if (rows.length === 0) return []
  const years = rows.map((r) => Number(r.period))
  const min = Math.min(...years), max = Math.max(...years)
  const map = new Map(rows.map((r) => [Number(r.period), Number(r.count)]))
  return Array.from({ length: max - min + 1 }, (_, i) => {
    const y = min + i
    return { period: String(y), label: String(y), count: map.get(y) ?? 0 }
  })
}
