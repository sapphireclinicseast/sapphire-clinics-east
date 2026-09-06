import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId } from '@/lib/auth'
import { ymdToDate, manilaTodayYmd } from '@/lib/availability'

// GET — the patient's own requests, with the offers therapists have made.
export async function GET() {
  const patientId = await getSessionPatientId()
  if (!patientId) return NextResponse.json({ requests: [] })
  const rows = await prisma.patientRequest.findMany({
    where: { patientId },
    orderBy: { createdAt: 'desc' },
    include: {
      offers: {
        where: { status: { in: ['PENDING', 'ACCEPTED'] } },
        orderBy: { createdAt: 'asc' },
        include: { provider: { select: { firstName: true, lastName: true, postNominals: true, profession: true, photo: true, yearsExperience: true } } },
      },
    },
  })
  const requests = rows.map((r) => ({
    id: r.id, city: r.city, profession: r.profession, status: r.status,
    preferredDate: r.preferredDate ? r.preferredDate.toISOString().slice(0, 10) : null,
    preferredTime: r.preferredTime, flexibility: r.flexibility, note: r.note,
    createdAt: r.createdAt.toISOString(),
    offers: r.offers.map((o) => ({
      id: o.id, status: o.status,
      date: o.date.toISOString().slice(0, 10), startTime: o.startTime, rate: Number(o.rate), message: o.message,
      providerName: `${o.provider.firstName} ${o.provider.lastName}${o.provider.postNominals ? `, ${o.provider.postNominals}` : ''}`,
      profession: o.provider.profession, photo: o.provider.photo, yearsExperience: o.provider.yearsExperience,
    })),
  }))
  return NextResponse.json({ requests })
}

// POST — post a new request (broadcast preferred day/time to therapists).
export async function POST(req: NextRequest) {
  const patientId = await getSessionPatientId()
  if (!patientId) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { city?: string; profession?: string; preferredDate?: string; preferredTime?: string; flexibility?: string; note?: string }
  const city = String(b.city ?? '').trim()
  if (!city) return NextResponse.json({ error: 'Please choose a city.' }, { status: 400 })
  const preferredDate = typeof b.preferredDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.preferredDate) ? b.preferredDate : null
  if (preferredDate && preferredDate < manilaTodayYmd()) return NextResponse.json({ error: 'Pick a future date.' }, { status: 409 })
  const preferredTime = typeof b.preferredTime === 'string' && /^\d{2}:\d{2}$/.test(b.preferredTime) ? b.preferredTime : null

  // Cap the number of active requests per patient to keep the board clean.
  const open = await prisma.patientRequest.count({ where: { patientId, status: { in: ['OPEN', 'PENDING_REFERRAL'] } } })
  if (open >= 5) return NextResponse.json({ error: 'You already have several active requests. Cancel one first.' }, { status: 409 })

  // Posted immediately, but held as PENDING_REFERRAL — it does NOT appear to
  // therapists until the patient attaches a doctor's referral.
  const created = await prisma.patientRequest.create({
    data: {
      patientId, city,
      profession: b.profession ? String(b.profession).slice(0, 40) : null,
      preferredDate: preferredDate ? ymdToDate(preferredDate) : null,
      preferredTime,
      flexibility: b.flexibility ? String(b.flexibility).slice(0, 300) : null,
      note: b.note ? String(b.note).slice(0, 800) : null,
      status: 'PENDING_REFERRAL',
    },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, id: created.id })
}
