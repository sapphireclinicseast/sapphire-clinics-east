import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { upcomingSlots, ymdToDate, manilaTodayYmd } from '@/lib/availability'

// GET /api/providers?city= — bookable providers covering the city, each with
// their upcoming open slots.
export async function GET(req: NextRequest) {
  const city = (req.nextUrl.searchParams.get('city') ?? '').trim()
  if (!city) return NextResponse.json({ providers: [] })

  const providers = await prisma.provider.findMany({
    where: { active: true, verificationStatus: 'VERIFIED', rate: { not: null }, citiesCovered: { has: city }, slots: { some: {} } },
    include: { slots: true },
  })

  const today = ymdToDate(manilaTodayYmd())
  const result = await Promise.all(
    providers.map(async (p) => {
      const bookings = await prisma.booking.findMany({
        where: { providerId: p.id, date: { gte: today }, status: { notIn: ['CANCELLED'] } },
        select: { date: true, startTime: true },
      })
      const booked = new Set(bookings.map((b) => `${b.date.toISOString().slice(0, 10)}|${b.startTime}`))
      const slots = upcomingSlots(p.slots.map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })), booked, 14, p.travelBuffer ? 120 : 60)
      const ratingAgg = await prisma.booking.aggregate({ where: { providerId: p.id, rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } })
      const certs = Array.isArray(p.certifications)
        ? (p.certifications as unknown[]).filter((c): c is Record<string, unknown> => !!c && typeof c === 'object').map((c) => String(c.name ?? '')).filter(Boolean)
        : []
      return {
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        postNominals: p.postNominals ?? null,
        profession: p.profession,
        photo: p.photo,
        yearsExperience: p.yearsExperience ?? null,
        school: p.school ?? null,
        postgraduate: p.postgraduate ?? null,
        certifications: certs,
        specialization: p.specialization ?? null,
        specializedRate: p.specializedRateApproved && p.specializedRate != null ? Number(p.specializedRate) : null,
        rate: p.rate != null ? Number(p.rate) : null,
        transpoIncluded: p.transpoIncluded,
        ratingAvg: ratingAgg._avg.rating != null ? Number(ratingAgg._avg.rating) : null,
        ratingCount: ratingAgg._count.rating,
        slots,
      }
    }),
  )

  // Only surface providers who actually have an open slot.
  return NextResponse.json({ providers: result.filter((p) => p.slots.length > 0) })
}
