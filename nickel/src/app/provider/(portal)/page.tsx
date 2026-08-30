import { getSessionProvider } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { upcomingSlots, ymdToDate, manilaTodayYmd } from '@/lib/availability'
import ScheduleManager from './ScheduleManager'

export const dynamic = 'force-dynamic'

export default async function SchedulePage() {
  const p = await getSessionProvider()
  if (!p) return null

  const slots = await prisma.providerSlot.findMany({
    where: { providerId: p.id },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  })

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const [bookings, pastRows] = await Promise.all([
    prisma.booking.findMany({
      where: { providerId: p.id, date: { gte: today }, status: { in: ['PENDING', 'PAID', 'CONFIRMED'] } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }], take: 60,
      include: { patient: { select: { firstName: true, lastName: true } } },
    }),
    prisma.booking.findMany({
      where: { providerId: p.id, OR: [{ date: { lt: today } }, { status: { in: ['COMPLETED', 'CANCELLED'] } }] },
      orderBy: [{ date: 'desc' }], take: 30,
      include: { patient: { select: { firstName: true, lastName: true } } },
    }),
  ])
  const map = (b: (typeof bookings)[number]) => ({
    id: b.id, date: b.date.toISOString().slice(0, 10), startTime: b.startTime, endTime: b.endTime,
    city: b.city, status: b.status, patientName: `${b.patient.firstName} ${b.patient.lastName}`,
    proposedDate: b.proposedDate ? b.proposedDate.toISOString().slice(0, 10) : null,
    proposedStartTime: b.proposedStartTime,
  })

  // Provider's own open upcoming slots — offered as choices when proposing a new time.
  const bookedRows = await prisma.booking.findMany({
    where: { providerId: p.id, date: { gte: ymdToDate(manilaTodayYmd()) }, status: { notIn: ['CANCELLED'] } },
    select: { date: true, startTime: true },
  })
  const booked = new Set(bookedRows.map((r) => `${r.date.toISOString().slice(0, 10)}|${r.startTime}`))
  const availableSlots = upcomingSlots(slots.map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })), booked, 14, p.travelBuffer ? 120 : 60)

  return <ScheduleManager slots={slots} bookings={bookings.map(map)} past={pastRows.map(map)} availableSlots={availableSlots} travelBuffer={p.travelBuffer} />
}
