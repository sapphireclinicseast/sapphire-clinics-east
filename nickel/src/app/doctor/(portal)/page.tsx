import { getSessionDoctor } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { upcomingSlots, ymdToDate, manilaTodayYmd } from '@/lib/availability'
import { payoutSummary, nextPayoutRun } from '@/lib/payout-summary'
import DoctorDashboard from './DoctorDashboard'

export const dynamic = 'force-dynamic'

export default async function DoctorHome() {
  const d = await getSessionDoctor()
  if (!d) return null

  const slots = await prisma.doctorSlot.findMany({ where: { doctorId: d.id }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] })
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const [consults, past] = await Promise.all([
    prisma.consult.findMany({ where: { doctorId: d.id, date: { gte: today }, status: { in: ['PENDING', 'PAID', 'CONFIRMED'] } }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }], take: 60, include: { patient: { select: { firstName: true, lastName: true } } } }),
    prisma.consult.findMany({ where: { doctorId: d.id, OR: [{ date: { lt: today } }, { status: { in: ['COMPLETED', 'CANCELLED'] } }] }, orderBy: [{ date: 'desc' }], take: 30, include: { patient: { select: { firstName: true, lastName: true } } } }),
  ])
  const map = (c: (typeof consults)[number]) => ({
    id: c.id, date: c.date.toISOString().slice(0, 10), startTime: c.startTime, status: c.status, mode: c.mode,
    amount: Number(c.amount), reason: c.reason, referralIssued: c.referralIssued,
    patientName: `${c.patient.firstName} ${c.patient.lastName}`,
  })

  const bookedRows = await prisma.consult.findMany({ where: { doctorId: d.id, date: { gte: ymdToDate(manilaTodayYmd()) }, status: { notIn: ['CANCELLED'] } }, select: { date: true, startTime: true } })
  const booked = new Set(bookedRows.map((r) => `${r.date.toISOString().slice(0, 10)}|${r.startTime}`))
  const availableSlots = upcomingSlots(slots.map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })), booked, 14, 60)

  const summary = await payoutSummary({ doctorId: d.id })
  const payout = { available: summary.available, maturing: summary.maturing, nextRun: nextPayoutRun().toISOString(), method: d.payoutMethod === 'gcash' ? 'gcash' : 'bank' }

  return <DoctorDashboard slots={slots} consults={consults.map(map)} past={past.map(map)} walletBalance={Number(d.walletBalance)} hasFee={d.consultFee != null} availableCount={availableSlots.length} payout={payout} />
}
