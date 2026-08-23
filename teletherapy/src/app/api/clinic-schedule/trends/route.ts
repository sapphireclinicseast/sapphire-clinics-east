import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/clinic-schedule/trends?department=&staffId=&branch=&fromYear=&toYear=
// Admin-only. Returns a monthly session-count time series across the chosen
// [fromYear, toYear] range (capped at the current month so future months don't
// drag the line to zero) plus the filter option lists. A "session" is any
// non-cancelled, non-rescheduled schedule row, counted against the owning
// clinician (staffId) + their department. Branch is attributed by the
// PATIENT's branch (where care actually happened) — NOT the clinician's home
// branch, so an interbranch consultant's East sessions aren't miscounted as
// their other branch.

const COUNTED_STATUSES = ['PENDING', 'CONFIRMED', 'COMPLETED'] as const
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const department = (searchParams.get('department') ?? 'all').trim()
  const staffId = (searchParams.get('staffId') ?? 'all').trim()
  const branch = (searchParams.get('branch') ?? 'all').trim()
  const fromRaw = (searchParams.get('fromYear') ?? '').trim()
  const toRaw = (searchParams.get('toYear') ?? '').trim()

  // Filter option lists (only clinicians/departments/branches/years that have
  // sessions), fetched first so year defaults can fall back to the real span.
  const [deptRows, clinicianRows, branchRows, yearRows] = await Promise.all([
    prisma.$queryRaw<{ department: string }[]>(Prisma.sql`
      SELECT DISTINCT st."department"::text AS department
      FROM "Staff" st WHERE EXISTS (SELECT 1 FROM "Schedule" s WHERE s."staffId" = st.id)
      ORDER BY 1`),
    prisma.$queryRaw<{ id: string; name: string; department: string; branch: string }[]>(Prisma.sql`
      SELECT st.id, (st."firstName" || ' ' || st."lastName") AS name, st."department"::text AS department, st."branch" AS branch
      FROM "Staff" st WHERE EXISTS (SELECT 1 FROM "Schedule" s WHERE s."staffId" = st.id)
      ORDER BY st."lastName", st."firstName"`),
    prisma.$queryRaw<{ branch: string }[]>(Prisma.sql`
      SELECT DISTINCT p."branch" AS branch
      FROM "Schedule" s JOIN "Patient" p ON p.id = s."patientId"
      WHERE p."branch" IS NOT NULL AND p."branch" <> '' AND p."branch" <> 'VERDANA_STORE'
      ORDER BY 1`),
    prisma.$queryRaw<{ year: number }[]>(Prisma.sql`
      SELECT DISTINCT EXTRACT(YEAR FROM s."date")::int AS year FROM "Schedule" s ORDER BY 1`),
  ])

  const availYears = yearRows.map((r) => Number(r.year))
  const nowY = new Date().getUTCFullYear()
  const minY = availYears[0] ?? nowY
  const maxY = availYears[availYears.length - 1] ?? nowY
  let fromY = /^\d{4}$/.test(fromRaw) ? Number(fromRaw) : minY
  let toY = /^\d{4}$/.test(toRaw) ? Number(toRaw) : maxY
  if (fromY > toY) [fromY, toY] = [toY, fromY]

  // WHERE fragments, composed under AND.
  const conds: Prisma.Sql[] = [
    Prisma.sql`s."status"::text IN (${Prisma.join([...COUNTED_STATUSES])})`,
    Prisma.sql`EXTRACT(YEAR FROM s."date") BETWEEN ${fromY} AND ${toY}`,
  ]
  if (department && department !== 'all') conds.push(Prisma.sql`st."department"::text = ${department}`)
  if (staffId && staffId !== 'all') conds.push(Prisma.sql`s."staffId" = ${staffId}`)
  // Branch = the patient's branch (where the session happened). LEFT JOIN below
  // keeps patient-less rows in the "all" view; a specific branch filters them out.
  if (branch && branch !== 'all') conds.push(Prisma.sql`p."branch" = ${branch}`)
  const where = Prisma.join(conds, ' AND ')

  const seriesRows = await prisma.$queryRaw<{ period: string; count: number }[]>(Prisma.sql`
    SELECT to_char(date_trunc('month', s."date"), 'YYYY-MM') AS period, COUNT(*)::int AS count
    FROM "Schedule" s
    JOIN "Staff" st ON st.id = s."staffId"
    LEFT JOIN "Patient" p ON p.id = s."patientId"
    WHERE ${where}
    GROUP BY 1
    ORDER BY 1
  `)

  const series = fillMonths(fromY, toY, seriesRows)
  const total = series.reduce((n, r) => n + r.count, 0)

  return NextResponse.json({
    series,
    total,
    range: { from: fromY, to: toY },
    filters: {
      departments: deptRows.map((r) => r.department),
      clinicians: clinicianRows,
      branches: branchRows.map((r) => r.branch),
      years: availYears,
    },
  })
}

// Continuous monthly buckets from Jan(fromY) to Dec(toY) — but never past the
// current month, so an in-progress or future year doesn't tail off to zero.
function fillMonths(fromY: number, toY: number, rows: { period: string; count: number }[]) {
  const map = new Map(rows.map((r) => [r.period, Number(r.count)]))
  const now = new Date()
  const curY = now.getUTCFullYear(), curM = now.getUTCMonth() + 1
  const endY = toY >= curY ? curY : toY
  const endM = toY >= curY ? curM : 12
  const out: { period: string; label: string; count: number }[] = []
  for (let y = fromY; y <= endY; y++) {
    const lastM = y === endY ? endM : 12
    for (let m = 1; m <= lastM; m++) {
      const key = `${y}-${String(m).padStart(2, '0')}`
      out.push({ period: key, label: MONTH_ABBR[m - 1], count: map.get(key) ?? 0 })
    }
  }
  return out
}
