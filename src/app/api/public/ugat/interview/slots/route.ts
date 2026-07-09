// Interview slots.
//   GET    → slots (future) with bookedCount  (any signed-in UGAT user)
//   POST   { startsAt, durationMins?, capacity? }  → create  (full admin)
//   DELETE { id }                                  → remove  (full admin)

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, isAdminRole } from '@/lib/ugat-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  const slots = await prisma.ugatInterviewSlot.findMany({ orderBy: { startsAt: 'asc' } })
  const bookings = await prisma.ugatApplication.groupBy({
    by: ['interviewSlotId'],
    where: { interviewSlotId: { not: null } },
    _count: { _all: true },
  })
  const counts = new Map(bookings.map((b) => [b.interviewSlotId, b._count._all]))
  const out = slots.map((s) => ({
    id: s.id, startsAt: s.startsAt, durationMins: s.durationMins, capacity: s.capacity,
    booked: counts.get(s.id) || 0,
  }))
  return NextResponse.json({ slots: out })
}

export async function POST(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  let body: { startsAt?: string; durationMins?: number; capacity?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const startsAt = body.startsAt ? new Date(body.startsAt) : null
  if (!startsAt || Number.isNaN(startsAt.getTime())) return NextResponse.json({ error: 'Please set a valid date and time.' }, { status: 400 })
  const durationMins = Math.min(240, Math.max(10, Number(body.durationMins) || 30))
  const capacity = Math.min(20, Math.max(1, Number(body.capacity) || 1))
  const c = await prisma.ugatInterviewSlot.create({ data: { startsAt, durationMins, capacity }, select: { id: true } })
  return NextResponse.json({ id: c.id })
}

export async function DELETE(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  let body: { id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  // Free any bookings that referenced this slot (keep the snapshot on the app).
  await prisma.ugatApplication.updateMany({ where: { interviewSlotId: id }, data: { interviewSlotId: null } })
  await prisma.ugatInterviewSlot.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
