import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionProviderId } from '@/lib/auth'
import { isValidSlot, ymdToDate, manilaTodayYmd } from '@/lib/availability'
import { notify } from '@/lib/notify'

// Provider proposes a new time for one of their bookings; the patient then
// accepts or declines it (see /api/patient/respond-proposal).
export async function POST(req: NextRequest) {
  const pid = await getSessionProviderId()
  if (!pid) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { bookingId?: string; date?: string; startTime?: string }
  const bookingId = String(b.bookingId ?? '')
  const date = String(b.date ?? ''); const startTime = String(b.startTime ?? '')
  if (!bookingId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) return NextResponse.json({ error: 'Missing new date/time' }, { status: 400 })
  if (date < manilaTodayYmd()) return NextResponse.json({ error: 'Pick a future date.' }, { status: 409 })

  const booking = await prisma.booking.findFirst({ where: { id: bookingId, providerId: pid }, select: { id: true, status: true, patientId: true } })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (!['PAID', 'CONFIRMED'].includes(booking.status)) return NextResponse.json({ error: 'This booking can’t be rescheduled.' }, { status: 409 })

  const provider = await prisma.provider.findUnique({ where: { id: pid }, include: { slots: true } })
  if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
  const rows = await prisma.booking.findMany({
    where: { providerId: pid, date: { gte: ymdToDate(manilaTodayYmd()) }, status: { notIn: ['CANCELLED'] }, id: { not: bookingId } },
    select: { date: true, startTime: true },
  })
  const booked = new Set(rows.map((r) => `${r.date.toISOString().slice(0, 10)}|${r.startTime}`))
  if (!isValidSlot(provider.slots, booked, date, startTime)) return NextResponse.json({ error: 'That time isn’t in your open availability (or is already taken).' }, { status: 409 })

  await prisma.booking.update({ where: { id: bookingId }, data: { proposedDate: ymdToDate(date), proposedStartTime: startTime, proposedAt: new Date() } })
  await notify({
    to: 'PATIENT', patientId: booking.patientId, bookingId: booking.id, type: 'RESCHEDULE_PROPOSED',
    title: 'New time proposed',
    body: `Your therapist proposed moving your visit to ${date} at ${startTime}. Open the booking to accept or decline.`,
  })
  return NextResponse.json({ ok: true })
}
