// GET /api/public/available-slots?branch=SBEA&department=PT&from=2026-04-20&to=2026-05-04
// Expands recurring DeckingSlot templates into concrete dated slots across
// the requested window, minus any slots already taken by non-cancelled
// PatientBookings. Returns at most ~400 entries.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { preflight, withCors } from '../_cors'

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
const MAX_PATIENTS_PER_SLOT = 3 // matches decking/slots enforcement

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') ?? ''
  const department = searchParams.get('department') ?? ''
  const fromStr = searchParams.get('from') ?? ''
  const toStr = searchParams.get('to') ?? ''

  if (!branch || !department || !fromStr || !toStr) {
    return withCors(
      NextResponse.json(
        { error: 'branch, department, from, and to are required (YYYY-MM-DD)' },
        { status: 400 },
      ),
      origin,
    )
  }

  const from = new Date(`${fromStr}T00:00:00.000Z`)
  const to = new Date(`${toStr}T23:59:59.999Z`)
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) {
    return withCors(NextResponse.json({ error: 'invalid date range' }, { status: 400 }), origin)
  }

  // Guard: cap window at 60 days
  const maxMs = 60 * 24 * 60 * 60 * 1000
  if (to.getTime() - from.getTime() > maxMs) {
    return withCors(
      NextResponse.json({ error: 'range > 60 days' }, { status: 400 }),
      origin,
    )
  }

  // Fetch template slots (weekly recurring) for branch+dept.
  const templates = await prisma.deckingSlot.findMany({
    where: {
      branch,
      department,
      disabled: false,
    },
    select: {
      id: true,
      staffId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      staff: { select: { id: true, firstName: true, lastName: true, sex: true } },
    },
  })

  // Fetch all existing bookings in window so we can subtract taken slots.
  const bookings = await prisma.patientBooking.findMany({
    where: {
      branch,
      department,
      date: { gte: from, lte: to },
      status: { in: ['PENDING', 'APPROVED', 'PAID', 'COMPLETED'] },
    },
    select: { staffId: true, date: true, startTime: true, endTime: true },
  })

  // Map (staffId|date|startTime) -> count
  const bookingCount = new Map<string, number>()
  for (const b of bookings) {
    const key = `${b.staffId}|${b.date.toISOString().slice(0, 10)}|${b.startTime}`
    bookingCount.set(key, (bookingCount.get(key) ?? 0) + 1)
  }

  // Expand templates across the window.
  type Slot = {
    staffId: string
    initials: string
    sex: 'M' | 'F' | null
    date: string
    startTime: string
    endTime: string
    dayOfWeek: string
  }
  const out: Slot[] = []

  const startDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const endDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()))
  for (
    let d = new Date(startDay);
    d.getTime() <= endDay.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const dow = DAY_NAMES[d.getUTCDay()]
    const dateStr = d.toISOString().slice(0, 10)
    for (const t of templates) {
      if (t.dayOfWeek !== dow) continue
      const key = `${t.staffId}|${dateStr}|${t.startTime}`
      const count = bookingCount.get(key) ?? 0
      if (count >= MAX_PATIENTS_PER_SLOT) continue
      const sexRaw = (t.staff.sex ?? '').trim().toUpperCase()
      const sex: 'M' | 'F' | null = sexRaw === 'M' ? 'M' : sexRaw === 'F' ? 'F' : null
      out.push({
        staffId: t.staffId,
        initials: `${t.staff.firstName?.[0] ?? '?'}${t.staff.lastName?.[0] ?? '?'}`.toUpperCase(),
        sex,
        date: dateStr,
        startTime: t.startTime,
        endTime: t.endTime,
        dayOfWeek: dow,
      })
      if (out.length >= 500) break
    }
    if (out.length >= 500) break
  }

  return withCors(NextResponse.json({ slots: out }), origin)
}
