import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionProviderId } from '@/lib/auth'
import { isValidSlot, ymdToDate, manilaTodayYmd } from '@/lib/availability'
import { notify } from '@/lib/notify'

// A verified provider offers a time on an open patient request. The patient
// then accepts (→ booking + payment) or picks someone else.
export async function POST(req: NextRequest) {
  const pid = await getSessionProviderId()
  if (!pid) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { requestId?: string; date?: string; startTime?: string; message?: string }
  const requestId = String(b.requestId ?? '')
  const date = String(b.date ?? ''); const startTime = String(b.startTime ?? '')
  if (!requestId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) return NextResponse.json({ error: 'Pick a date and time to offer.' }, { status: 400 })
  if (date < manilaTodayYmd()) return NextResponse.json({ error: 'Pick a future date.' }, { status: 409 })

  const provider = await prisma.provider.findUnique({ where: { id: pid }, include: { slots: true } })
  if (!provider || !provider.active || provider.verificationStatus !== 'VERIFIED') return NextResponse.json({ error: 'Your account can’t make offers yet.' }, { status: 403 })
  if (provider.rate == null) return NextResponse.json({ error: 'Set your session rate in Settings first.' }, { status: 409 })

  const request = await prisma.patientRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true, city: true, patientId: true, profession: true } })
  if (!request || request.status !== 'OPEN') return NextResponse.json({ error: 'This request is no longer open.' }, { status: 409 })
  if (!provider.citiesCovered.includes(request.city)) return NextResponse.json({ error: 'You don’t cover that city.' }, { status: 409 })

  // The offered time must be in the provider's real availability and free.
  const rows = await prisma.booking.findMany({
    where: { providerId: pid, date: { gte: ymdToDate(manilaTodayYmd()) }, status: { notIn: ['CANCELLED'] } },
    select: { date: true, startTime: true },
  })
  const booked = new Set(rows.map((r) => `${r.date.toISOString().slice(0, 10)}|${r.startTime}`))
  if (!isValidSlot(provider.slots, booked, date, startTime, provider.travelBuffer ? 120 : 60)) {
    return NextResponse.json({ error: 'That time isn’t in your open availability (or is taken).' }, { status: 409 })
  }

  // One active offer per provider per request.
  const existing = await prisma.requestOffer.findFirst({ where: { requestId, providerId: pid, status: { in: ['PENDING', 'ACCEPTED'] } }, select: { id: true } })
  if (existing) return NextResponse.json({ error: 'You’ve already made an offer on this request.' }, { status: 409 })

  await prisma.requestOffer.create({
    data: { requestId, providerId: pid, date: ymdToDate(date), startTime, rate: provider.rate, message: b.message ? String(b.message).slice(0, 500) : null },
  })
  await notify({
    to: 'PATIENT', patientId: request.patientId, type: 'REQUEST_OFFER',
    title: 'A therapist reached out',
    body: `${provider.firstName} ${provider.lastName} offered ${date} at ${startTime} for ₱${Math.round(Number(provider.rate)).toLocaleString('en-PH')}. Open your requests to accept.`,
  })
  return NextResponse.json({ ok: true })
}
