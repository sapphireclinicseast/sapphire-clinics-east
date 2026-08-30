import { getSessionProvider } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { upcomingSlots, ymdToDate, manilaTodayYmd } from '@/lib/availability'
import SessionsView from './SessionsView'

export const metadata = { title: 'Sessions' }
export const dynamic = 'force-dynamic'

export default async function SessionsPage() {
  const p = await getSessionProvider()
  if (!p) return null

  const [confirmedRows, pastRows] = await Promise.all([
    prisma.booking.findMany({
      where: { providerId: p.id, status: 'CONFIRMED' },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      include: { patient: { select: { firstName: true, lastName: true } } },
    }),
    prisma.booking.findMany({
      where: { providerId: p.id, status: { in: ['COMPLETED', 'CANCELLED'] } },
      orderBy: [{ date: 'desc' }], take: 300,
      include: { patient: { select: { firstName: true, lastName: true } } },
    }),
  ])
  const map = (b: (typeof confirmedRows)[number]) => ({
    id: b.id, date: b.date.toISOString().slice(0, 10), startTime: b.startTime, endTime: b.endTime,
    city: b.city, status: b.status, patientName: `${b.patient.firstName} ${b.patient.lastName}`,
    proposedStartTime: b.proposedStartTime,
  })

  const slots = await prisma.providerSlot.findMany({ where: { providerId: p.id } })
  const bookedRows = await prisma.booking.findMany({
    where: { providerId: p.id, date: { gte: ymdToDate(manilaTodayYmd()) }, status: { notIn: ['CANCELLED'] } },
    select: { date: true, startTime: true },
  })
  const booked = new Set(bookedRows.map((r) => `${r.date.toISOString().slice(0, 10)}|${r.startTime}`))
  const availableSlots = upcomingSlots(slots.map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })), booked, 14, p.travelBuffer ? 120 : 60)

  return <SessionsView confirmed={confirmedRows.map(map)} past={pastRows.map(map)} availableSlots={availableSlots} />
}
