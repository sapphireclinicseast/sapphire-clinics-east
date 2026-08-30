import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionDoctorId } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const did = await getSessionDoctorId()
  if (!did) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const dayOfWeek = Number(b.dayOfWeek)
  const startTime = String(b.startTime ?? '')
  const endTime = String(b.endTime ?? '')
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return NextResponse.json({ error: 'Invalid day' }, { status: 400 })
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return NextResponse.json({ error: 'Invalid time' }, { status: 400 })
  if (endTime <= startTime) return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
  try {
    const slot = await prisma.doctorSlot.create({ data: { doctorId: did, dayOfWeek, startTime, endTime } })
    return NextResponse.json({ slot })
  } catch {
    return NextResponse.json({ error: 'You already have a window at that day and start time' }, { status: 409 })
  }
}

export async function DELETE(req: NextRequest) {
  const did = await getSessionDoctorId()
  if (!did) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.doctorSlot.deleteMany({ where: { id, doctorId: did } })
  return NextResponse.json({ ok: true })
}
