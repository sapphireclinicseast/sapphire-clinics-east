import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionProviderId } from '@/lib/auth'

// Provider acts on one of their bookings.
// action: 'confirm' (PAID→CONFIRMED) | 'decline' (→CANCELLED) | 'complete' (CONFIRMED→COMPLETED)
export async function POST(req: NextRequest) {
  const pid = await getSessionProviderId()
  if (!pid) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { bookingId?: string; action?: string }
  const bookingId = String(b.bookingId ?? '')
  if (!bookingId) return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })

  const booking = await prisma.booking.findFirst({ where: { id: bookingId, providerId: pid }, select: { id: true, status: true } })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  let next: string | null = null
  if (b.action === 'confirm' && booking.status === 'PAID') next = 'CONFIRMED'
  else if (b.action === 'decline' && (booking.status === 'PAID' || booking.status === 'PENDING' || booking.status === 'CONFIRMED')) next = 'CANCELLED'
  else if (b.action === 'complete' && booking.status === 'CONFIRMED') next = 'COMPLETED'
  if (!next) return NextResponse.json({ error: `Can't ${b.action} a ${booking.status.toLowerCase()} booking.` }, { status: 409 })

  await prisma.booking.update({ where: { id: bookingId }, data: { status: next as never } })
  // A declined/cancelled paid booking drops out of settlements automatically
  // (the wallet query only sums status='PAID'); refunds follow Annex A manually.
  return NextResponse.json({ ok: true, status: next })
}
