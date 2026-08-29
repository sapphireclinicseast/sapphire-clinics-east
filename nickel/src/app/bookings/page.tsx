import { redirect } from 'next/navigation'
import { getSessionPatient } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PatientBookings from './PatientBookings'

export const metadata = { title: 'My bookings' }
export const dynamic = 'force-dynamic'

export default async function BookingsPage() {
  const patient = await getSessionPatient()
  if (!patient) redirect('/book')

  const rows = await prisma.booking.findMany({
    where: { patientId: patient.id },
    orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
    include: { provider: { select: { firstName: true, lastName: true, postNominals: true, profession: true } } },
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
  }))

  return <PatientBookings bookings={bookings} />
}
