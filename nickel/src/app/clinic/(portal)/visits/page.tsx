import { getSessionClinic } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import VisitsManager from './VisitsManager'

export const dynamic = 'force-dynamic'

export default async function ClinicVisitsPage() {
  const clinic = await getSessionClinic()
  if (!clinic) return null
  const [patients, providers, bookings] = await Promise.all([
    prisma.patient.findMany({ where: { clinicId: clinic.id }, orderBy: { firstName: 'asc' }, select: { id: true, firstName: true, lastName: true } }),
    prisma.provider.findMany({ where: { clinicId: clinic.id }, orderBy: { firstName: 'asc' }, select: { id: true, firstName: true, lastName: true, rate: true } }),
    prisma.booking.findMany({ where: { clinicId: clinic.id }, orderBy: [{ date: 'desc' }], take: 60, include: { patient: { select: { firstName: true, lastName: true } }, provider: { select: { firstName: true, lastName: true } } } }),
  ])
  return <VisitsManager
    verified={clinic.verificationStatus === 'VERIFIED'}
    city={clinic.city ?? ''}
    patients={patients}
    providers={providers.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, rate: p.rate != null ? Number(p.rate) : null }))}
    bookings={bookings.map((b) => ({
      id: b.id, date: b.date.toISOString().slice(0, 10), startTime: b.startTime, status: b.status,
      patientName: `${b.patient.firstName} ${b.patient.lastName}`, providerName: `${b.provider.firstName} ${b.provider.lastName}`,
      amount: Number(b.amount), routing: b.paymentRouting, collection: b.collectionMode,
      therapistCut: b.therapistCut != null ? Number(b.therapistCut) : null, payoutStatus: b.payoutStatus, checkoutUrl: b.checkoutUrl,
    }))}
  />
}
