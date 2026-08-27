// /api/homecare-admin/open-days — manage a city's recurring WEEKLY open days.
// GET ?cityId= → its weekly rules (+ all-time booked count). POST create.
// PATCH update. DELETE ?id=.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkAdminToken } from '@/lib/aurora-admin'
import { isShortBranch, usedCapacity } from '@/lib/homecare'

function guard(req: NextRequest) {
  return checkAdminToken(req) ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function GET(req: NextRequest) {
  const denied = guard(req)
  if (denied) return denied
  const cityId = req.nextUrl.searchParams.get('cityId') ?? undefined
  const rules = await prisma.homecareOpenDay.findMany({
    where: cityId ? { cityId } : {},
    orderBy: [{ branch: 'asc' }, { dayOfWeek: 'asc' }],
  })
  const withUsed = await Promise.all(rules.map(async (d) => ({ ...d, used: await usedCapacity(d.id) })))
  return NextResponse.json({ openDays: withUsed })
}

export async function POST(req: NextRequest) {
  const denied = guard(req)
  if (denied) return denied
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const cityId = String(b.cityId ?? '')
  const branch = b.branch
  const dayOfWeek = Number(b.dayOfWeek)
  if (!cityId || !isShortBranch(branch) || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return NextResponse.json({ error: 'cityId, branch (SBEA|SBGH), and dayOfWeek (0–6) are required' }, { status: 400 })
  }
  try {
    const day = await prisma.homecareOpenDay.create({
      data: {
        cityId,
        branch,
        dayOfWeek,
        startTime: String(b.startTime ?? '09:00'),
        endTime: String(b.endTime ?? '17:00'),
        capacity: Number(b.capacity ?? 6),
        notes: (String(b.notes ?? '').trim()) || null,
      },
    })
    return NextResponse.json({ openDay: day })
  } catch {
    return NextResponse.json({ error: 'That branch already has this weekday open for this city' }, { status: 409 })
  }
}

export async function PATCH(req: NextRequest) {
  const denied = guard(req)
  if (denied) return denied
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = String(b.id ?? '')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const data: Record<string, unknown> = {}
  if (typeof b.startTime === 'string') data.startTime = b.startTime
  if (typeof b.endTime === 'string') data.endTime = b.endTime
  if (b.capacity != null) data.capacity = Number(b.capacity)
  if (typeof b.disabled === 'boolean') data.disabled = b.disabled
  if ('notes' in b) data.notes = (String(b.notes ?? '').trim()) || null
  const day = await prisma.homecareOpenDay.update({ where: { id }, data })
  return NextResponse.json({ openDay: day })
}

export async function DELETE(req: NextRequest) {
  const denied = guard(req)
  if (denied) return denied
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if ((await usedCapacity(id)) > 0) {
    return NextResponse.json({ error: 'This weekly slot already has bookings. Disable it instead of deleting.' }, { status: 409 })
  }
  await prisma.homecareOpenDay.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
