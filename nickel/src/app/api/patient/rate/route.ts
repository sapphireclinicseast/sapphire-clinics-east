import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId } from '@/lib/auth'

// Patient rates the therapist after a completed session (0–5, optional review).
export async function POST(req: NextRequest) {
  const patientId = await getSessionPatientId()
  if (!patientId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { bookingId?: string; rating?: number; review?: string }
  const bookingId = String(b.bookingId ?? '')
  const rating = Math.round(Number(b.rating))
  if (!Number.isInteger(rating) || rating < 0 || rating > 5) return NextResponse.json({ error: 'Pick a rating from 0 to 5.' }, { status: 400 })

  const booking = await prisma.booking.findFirst({ where: { id: bookingId, patientId }, select: { id: true, status: true, ratedAt: true } })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status !== 'COMPLETED') return NextResponse.json({ error: 'You can rate a therapist after the visit is completed.' }, { status: 409 })
  if (booking.ratedAt) return NextResponse.json({ error: 'You’ve already rated this visit.' }, { status: 409 })

  await prisma.booking.update({
    where: { id: bookingId },
    data: { rating, review: b.review ? String(b.review).slice(0, 600) : null, ratedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
