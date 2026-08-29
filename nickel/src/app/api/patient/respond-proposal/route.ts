import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId } from '@/lib/auth'

function addHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Patient accepts or declines the provider's proposed new time.
export async function POST(req: NextRequest) {
  const patientId = await getSessionPatientId()
  if (!patientId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { bookingId?: string; accept?: boolean }
  const bookingId = String(b.bookingId ?? '')

  const booking = await prisma.booking.findFirst({ where: { id: bookingId, patientId } })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (!booking.proposedDate || !booking.proposedStartTime) return NextResponse.json({ error: 'No proposed time to respond to.' }, { status: 409 })

  if (b.accept) {
    // Move the visit to the proposed time and confirm it.
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        date: booking.proposedDate, startTime: booking.proposedStartTime, endTime: addHour(booking.proposedStartTime),
        status: 'CONFIRMED', proposedDate: null, proposedStartTime: null, proposedAt: null,
      },
    })
    return NextResponse.json({ ok: true, accepted: true })
  }
  // Declined — clear the proposal, keep the original time (provider can confirm or decline).
  await prisma.booking.update({ where: { id: bookingId }, data: { proposedDate: null, proposedStartTime: null, proposedAt: null } })
  return NextResponse.json({ ok: true, accepted: false })
}
