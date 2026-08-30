import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { upcomingSlots, ymdToDate, manilaTodayYmd } from '@/lib/availability'

// GET /api/doctors?mode=TELECONSULT|IN_PERSON[&city=] — verified rehab doctors
// offering that consult mode, with their upcoming open slots.
export async function GET(req: NextRequest) {
  const mode = (req.nextUrl.searchParams.get('mode') ?? 'TELECONSULT').toUpperCase()
  const city = (req.nextUrl.searchParams.get('city') ?? '').trim()
  const where: Record<string, unknown> = { active: true, verificationStatus: 'VERIFIED', consultFee: { not: null }, slots: { some: {} } }
  if (mode === 'IN_PERSON') { where.inPersonEnabled = true; if (city) where.clinicCity = city } else where.teleconsultEnabled = true

  const doctors = await prisma.doctor.findMany({ where, include: { slots: true } })
  const today = ymdToDate(manilaTodayYmd())
  const result = await Promise.all(doctors.map(async (d) => {
    const consults = await prisma.consult.findMany({ where: { doctorId: d.id, date: { gte: today }, status: { notIn: ['CANCELLED'] } }, select: { date: true, startTime: true } })
    const booked = new Set(consults.map((c) => `${c.date.toISOString().slice(0, 10)}|${c.startTime}`))
    const slots = upcomingSlots(d.slots.map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })), booked, 14, 60)
    return {
      id: d.id,
      name: `${d.firstName} ${d.lastName}${d.postNominals ? `, ${d.postNominals}` : ''}`,
      photo: d.photo, specialization: d.specialization,
      consultFee: d.consultFee != null ? Number(d.consultFee) : null,
      teleconsult: d.teleconsultEnabled, inPerson: d.inPersonEnabled,
      clinicName: d.clinicName, clinicAddress: d.clinicAddress, clinicCity: d.clinicCity,
      slots,
    }
  }))
  return NextResponse.json({ doctors: result.filter((d) => d.slots.length > 0) })
}
