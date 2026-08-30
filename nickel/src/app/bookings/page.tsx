import { redirect } from 'next/navigation'
import { getSessionPatient } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PatientBookings from './PatientBookings'

export const metadata = { title: 'My bookings' }
export const dynamic = 'force-dynamic'

export default async function BookingsPage() {
  const patient = await getSessionPatient()
  if (!patient) redirect('/book')

  const [rows, walletTxns, consultRows] = await Promise.all([
    prisma.booking.findMany({
      where: { patientId: patient.id },
      orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
      include: { provider: { select: { firstName: true, lastName: true, postNominals: true, profession: true, priceProgressReport: true, priceHEP: true } } },
    }),
    prisma.walletTransaction.findMany({ where: { patientId: patient.id }, orderBy: { createdAt: 'desc' }, take: 12 }),
    prisma.consult.findMany({
      where: { patientId: patient.id, status: { notIn: ['PENDING'] } },
      orderBy: [{ date: 'desc' }],
      include: { doctor: { select: { firstName: true, lastName: true, postNominals: true, clinicName: true, clinicAddress: true } } },
    }),
  ])
  const documents = await prisma.sessionDocument.findMany({
    where: { patientId: patient.id, status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, type: true, bookingId: true, createdAt: true, provider: { select: { firstName: true, lastName: true } }, doctor: { select: { firstName: true, lastName: true } } },
  })

  const bookings = rows.map((b) => ({
    id: b.id,
    date: b.date.toISOString().slice(0, 10),
    startTime: b.startTime,
    city: b.city,
    status: b.status,
    amount: Number(b.amount),
    providerName: `${b.provider.firstName} ${b.provider.lastName}${b.provider.postNominals ? `, ${b.provider.postNominals}` : ''}`,
    profession: b.provider.profession,
    proposedDate: b.proposedDate ? b.proposedDate.toISOString().slice(0, 10) : null,
    proposedStartTime: b.proposedStartTime,
    rating: b.rating,
    rated: !!b.ratedAt,
    priceProgressReport: b.provider.priceProgressReport != null ? Number(b.provider.priceProgressReport) : null,
    priceHEP: b.provider.priceHEP != null ? Number(b.provider.priceHEP) : null,
  }))

  const wallet = {
    balance: Number(patient.walletBalance ?? 0),
    txns: walletTxns.map((t) => ({ id: t.id, amount: Number(t.amount), type: t.type, note: t.note, createdAt: t.createdAt.toISOString() })),
  }

  const consults = consultRows.map((c) => ({
    id: c.id,
    date: c.date.toISOString().slice(0, 10), startTime: c.startTime, status: c.status, mode: c.mode,
    doctorName: `Dr. ${c.doctor.firstName} ${c.doctor.lastName}${c.doctor.postNominals ? `, ${c.doctor.postNominals}` : ''}`,
    clinic: c.doctor.clinicName ? `${c.doctor.clinicName}${c.doctor.clinicAddress ? ` · ${c.doctor.clinicAddress}` : ''}` : null,
    referralIssued: c.referralIssued,
  }))

  const docs = documents.map((d) => ({
    id: d.id, type: d.type, bookingId: d.bookingId, date: d.createdAt.toISOString().slice(0, 10),
    providerName: d.doctor ? `Dr. ${d.doctor.firstName} ${d.doctor.lastName}` : d.provider ? `${d.provider.firstName} ${d.provider.lastName}` : '',
  }))

  return <PatientBookings bookings={bookings} wallet={wallet} consults={consults} documents={docs} />
}
