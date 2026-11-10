// How many patients one cell of the board may hold.
//
//   GET  /api/decking/capacity?branch=SBEA   every shared hour in the branch
//   POST /api/decking/capacity               set one cell's capacity
//
// One is the default and is stored as the ABSENCE of a row, so this table is
// the list of shared hours rather than a second copy of the board. Setting a
// cell back to one deletes its row.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWriteSlot, CROSS_BRANCH_DENIED } from '@/lib/decking-access'

export const dynamic = 'force-dynamic'

/** The board refuses a fourth patient in an hour; so does this. */
const MAX_CAPACITY = 3

/** UTC midnight, or null for the standing weekly pattern. */
function parseDate(value: unknown): Date | null {
  if (!value) return null
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch')
  const rows = await prisma.deckingSlotCapacity.findMany({
    where: { ...(branch ? { branch } : {}) },
    select: {
      id: true, staffId: true, branch: true, department: true,
      dayOfWeek: true, startTime: true, date: true, capacity: true,
    },
  })
  return NextResponse.json(rows.map(r => ({
    ...r,
    date: r.date ? r.date.toISOString().slice(0, 10) : null,
  })))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { staffId, branch, department, dayOfWeek, startTime, date, deliveryMode } = body
  const capacity = Number(body.capacity)

  if (!staffId || !branch || !department || !dayOfWeek || !startTime) {
    return NextResponse.json(
      { error: 'staffId, branch, department, dayOfWeek and startTime are required' }, { status: 400 },
    )
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
    return NextResponse.json({ error: `Capacity must be between 1 and ${MAX_CAPACITY}` }, { status: 400 })
  }

  // The same guard the slots themselves use, so a branch-scoped account cannot
  // reshape the other branch's board. Hiding a control is not a permission.
  const role = (session.user as { role?: string })?.role ?? ''
  const mode = ['ONSITE', 'TELETHERAPY', 'HOMECARE'].includes(deliveryMode) ? deliveryMode : null
  if (!canWriteSlot(role, branch, mode)) {
    return NextResponse.json({ error: CROSS_BRANCH_DENIED }, { status: 403 })
  }

  const when = parseDate(date)

  // findFirst rather than upsert: the unique key contains a NULLABLE date, and
  // SQL does not consider two NULLs equal, so Prisma refuses a compound unique
  // `where` that includes one. Every weekly cell has a null date.
  const existing = await prisma.deckingSlotCapacity.findFirst({
    where: { staffId, dayOfWeek, startTime, date: when },
    select: { id: true },
  })

  // Back to one patient: the row IS the declaration, so removing it is how the
  // cell returns to the default rather than storing a 1 nobody needs.
  if (capacity === 1) {
    if (existing) await prisma.deckingSlotCapacity.delete({ where: { id: existing.id } })
    return NextResponse.json({ ok: true, capacity: 1 })
  }

  // Never below what the cell already holds. Front desk shrinking a shared
  // hour is a decision about the patients in it, taken by removing them; doing
  // it here would leave somebody booked into a line the board cannot draw.
  const booked = await prisma.deckingSlot.count({
    where: { staffId, dayOfWeek, startTime, date: when, isClass: false, patientId: { not: null } },
  })
  if (capacity < booked) {
    return NextResponse.json(
      { error: `This hour already holds ${booked} patients. Remove one first.` }, { status: 400 },
    )
  }

  const row = existing
    ? await prisma.deckingSlotCapacity.update({ where: { id: existing.id }, data: { capacity } })
    : await prisma.deckingSlotCapacity.create({
        data: { staffId, branch, department, dayOfWeek, startTime, date: when, capacity },
      })

  return NextResponse.json({ ok: true, capacity: row.capacity })
}
