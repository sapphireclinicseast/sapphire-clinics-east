import { getSessionProvider } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { upcomingSlots, ymdToDate, manilaTodayYmd } from '@/lib/availability'
import ScheduleManager from '../ScheduleManager'
import ScheduleCalendar, { type CalSession } from './ScheduleCalendar'

export const metadata = { title: 'Schedule' }
export const dynamic = 'force-dynamic'

export default async function SchedulePage() {
  const p = await getSessionProvider()
  if (!p) return null

  const slots = await prisma.providerSlot.findMany({ where: { providerId: p.id }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] })

  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const [bookings, calRows] = await Promise.all([
    prisma.booking.findMany({
      where: { providerId: p.id, date: { gte: today }, status: { in: ['PENDING', 'PAID', 'CONFIRMED'] } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }], take: 60,
      include: { patient: { select: { firstName: true, lastName: true } } },
    }),
    // All sessions for the calendar + lifetime stats.
    prisma.booking.findMany({
      where: { providerId: p.id },
      orderBy: [{ date: 'asc' }], take: 1000,
      include: { patient: { select: { firstName: true, lastName: true } } },
    }),
  ])
  const map = (b: (typeof bookings)[number]) => ({
    id: b.id, date: b.date.toISOString().slice(0, 10), startTime: b.startTime, endTime: b.endTime,
    city: b.city, status: b.status, patientName: `${b.patient.firstName} ${b.patient.lastName}`,
    proposedDate: b.proposedDate ? b.proposedDate.toISOString().slice(0, 10) : null,
    proposedStartTime: b.proposedStartTime,
  })

  const sessions: CalSession[] = calRows.map((b) => ({
    id: b.id, date: b.date.toISOString().slice(0, 10), startTime: b.startTime, endTime: b.endTime,
    patientName: `${b.patient.firstName} ${b.patient.lastName}`, status: b.status, rescheduled: !!b.proposedStartTime,
  }))

  // Lifetime stats.
  const active = calRows.filter((b) => b.status !== 'CANCELLED')
  const confirmedCount = calRows.filter((b) => b.status === 'CONFIRMED' || b.status === 'COMPLETED').length
  const uniquePatients = new Set(active.map((b) => b.patientId)).size
  const activeDays = new Set(active.map((b) => b.date.toISOString().slice(0, 10))).size
  const avgPerDay = activeDays ? (active.length / activeDays) : 0

  const bookedRows = await prisma.booking.findMany({ where: { providerId: p.id, date: { gte: ymdToDate(manilaTodayYmd()) }, status: { notIn: ['CANCELLED'] } }, select: { date: true, startTime: true } })
  const booked = new Set(bookedRows.map((r) => `${r.date.toISOString().slice(0, 10)}|${r.startTime}`))
  const availableSlots = upcomingSlots(slots.map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })), booked, 14, p.travelBuffer ? 120 : 60)

  const Stat = ({ label, value, sub }: { label: string; value: string | number; sub: string }) => (
    <div className="card"><div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--muted)]">{label}</div><div className="mt-1 text-[26px] font-bold text-[color:var(--steel)]">{value}</div><div className="text-[12px] text-[color:var(--slate)]">{sub}</div></div>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Confirmed sessions" value={confirmedCount} sub="lifetime total" />
        <Stat label="Unique patients" value={uniquePatients} sub="lifetime total" />
        <Stat label="Avg patients / day" value={avgPerDay ? avgPerDay.toFixed(1) : 0} sub={`${activeDays} active day${activeDays === 1 ? '' : 's'}`} />
      </div>

      <ScheduleCalendar sessions={sessions} />

      <ScheduleManager slots={slots} bookings={bookings.map(map)} availableSlots={availableSlots} travelBuffer={p.travelBuffer} />
    </div>
  )
}
