import { getSessionProvider } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { variantForAge } from '@/lib/forms/schemas'
import DocWorkspace from './DocWorkspace'

export const dynamic = 'force-dynamic'

export default async function NotesPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params
  const provider = await getSessionProvider()
  if (!provider) return null
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, providerId: provider.id },
    include: { patient: { select: { firstName: true, lastName: true, dob: true, sex: true } } },
  })
  if (!booking) return <div className="card text-[13px] text-[color:var(--slate)]">Booking not found.</div>

  const docs = await prisma.sessionDocument.findMany({ where: { bookingId, providerId: provider.id }, orderBy: { createdAt: 'desc' } })
  const openRequests = await prisma.docRequest.findMany({
    where: { providerId: provider.id, patientId: booking.patientId, status: 'REQUESTED', paidAt: { not: null } },
    select: { id: true, type: true },
  })
  const variant = variantForAge(booking.patient.dob)
  const age = booking.patient.dob ? Math.floor((Date.now() - booking.patient.dob.getTime()) / (365.25 * 864e5)) : null

  return <DocWorkspace
    bookingId={bookingId}
    patientName={`${booking.patient.firstName} ${booking.patient.lastName}`}
    patientAge={age}
    patientSex={booking.patient.sex ?? null}
    variant={variant}
    date={booking.date.toISOString().slice(0, 10)}
    openRequests={openRequests.map((r) => r.type)}
    docs={docs.map((d) => ({ id: d.id, type: d.type, status: d.status, source: d.source, data: (d.data as Record<string, unknown>) ?? {}, createdAt: d.createdAt.toISOString() }))}
  />
}
