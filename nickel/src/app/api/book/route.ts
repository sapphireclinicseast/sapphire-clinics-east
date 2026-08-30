import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId } from '@/lib/auth'
import { isValidSlot, ymdToDate, manilaTodayYmd } from '@/lib/availability'
import { startBooking } from '@/lib/booking-create'

export async function POST(req: NextRequest) {
  const patientId = await getSessionPatientId()
  if (!patientId) return NextResponse.json({ error: 'Please sign in to book.' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { providerId?: string; date?: string; startTime?: string; city?: string; useWallet?: boolean }
  const providerId = String(b.providerId ?? '')
  const date = String(b.date ?? '')
  const startTime = String(b.startTime ?? '')
  const city = String(b.city ?? '').trim()
  if (!providerId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime) || !city) {
    return NextResponse.json({ error: 'Missing booking details' }, { status: 400 })
  }
  if (date < manilaTodayYmd()) return NextResponse.json({ error: 'That date has passed. Please pick another.' }, { status: 409 })

  const provider = await prisma.provider.findUnique({ where: { id: providerId }, include: { slots: true } })
  if (!provider || !provider.active || provider.verificationStatus !== 'VERIFIED' || provider.rate == null) return NextResponse.json({ error: 'Therapist is not available.' }, { status: 409 })
  if (!provider.citiesCovered.includes(city)) return NextResponse.json({ error: 'This therapist does not cover that city.' }, { status: 409 })

  const bookedRows = await prisma.booking.findMany({
    where: { providerId, date: { gte: ymdToDate(manilaTodayYmd()) }, status: { notIn: ['CANCELLED'] } },
    select: { date: true, startTime: true },
  })
  const booked = new Set(bookedRows.map((r) => `${r.date.toISOString().slice(0, 10)}|${r.startTime}`))
  if (!isValidSlot(provider.slots, booked, date, startTime, provider.travelBuffer ? 120 : 60)) {
    return NextResponse.json({ error: 'That time is no longer available. Please pick another.' }, { status: 409 })
  }

  const r = await startBooking({
    patientId, providerId, providerName: `${provider.firstName} ${provider.lastName}`,
    transpoIncluded: provider.transpoIncluded, city, date, bookedDate: ymdToDate(date), startTime,
    amount: Number(provider.rate), useWallet: b.useWallet === true,
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  if ('paid' in r) return NextResponse.json({ bookingId: r.bookingId, paid: true, redirect: '/bookings' })
  return NextResponse.json({ bookingId: r.bookingId, checkoutUrl: r.checkoutUrl })
}
