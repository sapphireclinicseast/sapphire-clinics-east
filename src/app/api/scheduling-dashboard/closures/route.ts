// Days the clinic did not open.
//
//   GET    /api/scheduling-dashboard/closures?start=…&end=…
//   POST   /api/scheduling-dashboard/closures   { date, branch, reason }
//   DELETE /api/scheduling-dashboard/closures   { id }
//
// Clinic Utilization is "sessions ÷ (daily cap × days in the range)". A day
// nobody could come in — a public holiday, a typhoon, a flood — has to leave
// that denominator, or the clinic is marked down for hours it was never able
// to offer.
//
// Recorded by hand rather than inferred from a day with no sessions: in the
// session table a quiet day and a closed day look identical, and only one of
// them is the clinic's fault. Inferring would also silently flatter every
// genuinely dead day into a non-day.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// The same split as cap-settings, and for the same reason: these rows move
// the utilization figure, so writing them is not something every account that
// can READ the dashboard should be able to do.
const READ_ROLES  = ['ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'MARKETING_ADMIN']
const WRITE_ROLES = READ_ROLES

const BRANCHES = ['ALL', 'SBEA', 'SBGH'] as const

/** YYYY-MM-DD → UTC midnight, or null if it is not a date. */
function parseDay(v: unknown): Date | null {
  const s = String(v ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

const shape = (r: { id: string; date: Date; branch: string; reason: string | null; createdByName: string | null }) => ({
  id: r.id,
  date: r.date.toISOString().slice(0, 10),
  branch: r.branch,
  reason: r.reason,
  createdByName: r.createdByName,
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string })?.role ?? ''
  if (!READ_ROLES.includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Unbounded when no range is given — the Settings list shows everything, and
  // there are a handful of these a year, not a table worth paginating.
  const start = parseDay(req.nextUrl.searchParams.get('start'))
  const end   = parseDay(req.nextUrl.searchParams.get('end'))

  try {
    const rows = await prisma.clinicClosure.findMany({
      where: (start || end)
        ? { date: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }
        : {},
      orderBy: { date: 'desc' },
      select: { id: true, date: true, branch: true, reason: true, createdByName: true },
    })
    return NextResponse.json(rows.map(shape))
  } catch (e) {
    console.error('closures GET', e)
    // An empty list rather than a 500: a dashboard that cannot read the
    // closures should still render, counting every day, which is the figure
    // it showed before this feature existed.
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string })?.role ?? ''
  if (!WRITE_ROLES.includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const date = parseDay(body.date)
  if (!date) return NextResponse.json({ error: 'A date is required (YYYY-MM-DD).' }, { status: 400 })

  const branch = BRANCHES.includes(body.branch) ? body.branch : 'ALL'
  const reason = String(body.reason ?? '').trim().slice(0, 200) || null
  const who = (session.user as { name?: string | null })?.name ?? null

  try {
    // Upsert, so marking the same day twice edits the reason instead of
    // failing on the unique index — front desk correcting a typo should not
    // meet a constraint error.
    const row = await prisma.clinicClosure.upsert({
      where:  { date_branch: { date, branch } },
      create: { date, branch, reason, createdByName: who },
      update: { reason },
      select: { id: true, date: true, branch: true, reason: true, createdByName: true },
    })
    return NextResponse.json(shape(row))
  } catch (e) {
    console.error('closures POST', e)
    return NextResponse.json({ error: 'That closure could not be saved.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string })?.role ?? ''
  if (!WRITE_ROLES.includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  try {
    await prisma.clinicClosure.delete({ where: { id } })
  } catch {
    // Already gone. Removing a row twice is a double-click, not an error.
  }
  return NextResponse.json({ ok: true })
}
