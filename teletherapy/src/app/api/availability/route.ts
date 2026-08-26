// /api/availability
//   GET  — my published availability slots
//   POST — add a slot { dayFrom, dayTo, timeStart, timeEnd }  (Calendly-style)

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function u(session: { user?: unknown } | null) {
  return session?.user as unknown as { id: string; staffId?: string } | undefined
}

export async function GET() {
  const acc = u(await auth())
  if (!acc) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const slots = await prisma.availabilitySlot.findMany({
    where: { accountId: acc.id },
    orderBy: [{ dayFrom: 'asc' }, { timeStart: 'asc' }],
  })
  return NextResponse.json({ slots })
}

export async function POST(req: Request) {
  const acc = u(await auth())
  if (!acc) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { dayFrom?: unknown; dayTo?: unknown; timeStart?: unknown; timeEnd?: unknown } = {}
  try { body = await req.json() } catch { /* handled */ }
  const dayFrom = Number(body.dayFrom)
  const dayTo = Number(body.dayTo)
  const timeStart = String(body.timeStart ?? '').trim()
  const timeEnd = String(body.timeEnd ?? '').trim()
  const okDay = (d: number) => Number.isInteger(d) && d >= 0 && d <= 6
  if (!okDay(dayFrom) || !okDay(dayTo)) return NextResponse.json({ error: 'Pick a valid day range.' }, { status: 400 })
  if (!/^\d{1,2}:\d{2}$/.test(timeStart) || !/^\d{1,2}:\d{2}$/.test(timeEnd)) return NextResponse.json({ error: 'Pick a start and end time.' }, { status: 400 })
  if (timeEnd <= timeStart) return NextResponse.json({ error: 'End time must be after start time.' }, { status: 400 })

  const slot = await prisma.availabilitySlot.create({
    data: { accountId: acc.id, staffId: acc.staffId ?? '', dayFrom, dayTo, timeStart, timeEnd },
  })
  return NextResponse.json({ slot })
}
