import { getSessionProvider } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import ScheduleManager from './ScheduleManager'

export default async function SchedulePage() {
  const p = await getSessionProvider()
  if (!p) return null

  const slots = await prisma.providerSlot.findMany({
    where: { providerId: p.id },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  })

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const bookings = await prisma.booking.findMany({
    where: { providerId: p.id, date: { gte: today }, status: { in: ['PENDING', 'PAID', 'CONFIRMED'] } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    take: 40,
    include: { patient: { select: { firstName: true, lastName: true } } },
  })

  return (
    <ScheduleManager
      slots={slots}
      bookings={bookings.map((b) => ({
        id: b.id,
        date: b.date.toISOString().slice(0, 10),
        startTime: b.startTime,
        endTime: b.endTime,
        city: b.city,
        status: b.status,
        patientName: `${b.patient.firstName} ${b.patient.lastName}`,
      }))}
    />
  )
}
