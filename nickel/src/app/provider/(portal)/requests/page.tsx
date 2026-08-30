import { getSessionProvider } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { upcomingSlots, ymdToDate, manilaTodayYmd } from '@/lib/availability'
import ProviderRequests from './ProviderRequests'

export const dynamic = 'force-dynamic'

export default async function ProviderRequestsPage() {
  const p = await getSessionProvider()
  if (!p) return null

  const slots = await prisma.providerSlot.findMany({ where: { providerId: p.id }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] })
  const bookedRows = await prisma.booking.findMany({
    where: { providerId: p.id, date: { gte: ymdToDate(manilaTodayYmd()) }, status: { notIn: ['CANCELLED'] } },
    select: { date: true, startTime: true },
  })
  const booked = new Set(bookedRows.map((r) => `${r.date.toISOString().slice(0, 10)}|${r.startTime}`))
  const availableSlots = upcomingSlots(slots.map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })), booked, 14, p.travelBuffer ? 120 : 60)

  const eligible = p.active && p.verificationStatus === 'VERIFIED'
  return <ProviderRequests availableSlots={availableSlots} eligible={eligible} hasRate={p.rate != null} rate={p.rate != null ? Number(p.rate) : null} />
}
