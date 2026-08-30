import { getSessionDoctor } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import DoctorDocWorkspace from './DoctorDocWorkspace'

export const dynamic = 'force-dynamic'

export default async function DoctorNotesPage({ params }: { params: Promise<{ consultId: string }> }) {
  const { consultId } = await params
  const doctor = await getSessionDoctor()
  if (!doctor) return null
  const consult = await prisma.consult.findFirst({
    where: { id: consultId, doctorId: doctor.id },
    include: { patient: { select: { firstName: true, lastName: true, dob: true, sex: true } } },
  })
  if (!consult) return <div className="card text-[13px] text-[color:var(--slate)]">Consult not found.</div>

  const docs = await prisma.sessionDocument.findMany({ where: { consultId, doctorId: doctor.id }, orderBy: { createdAt: 'desc' } })
  const age = consult.patient.dob ? Math.floor((Date.now() - consult.patient.dob.getTime()) / (365.25 * 864e5)) : null

  return <DoctorDocWorkspace
    consultId={consultId}
    patientName={`${consult.patient.firstName} ${consult.patient.lastName}`}
    patientAge={age}
    patientSex={consult.patient.sex ?? null}
    hasSignature={!!doctor.signature}
    date={consult.date.toISOString().slice(0, 10)}
    docs={docs.map((d) => ({ id: d.id, type: d.type, status: d.status, source: d.source, data: (d.data as Record<string, unknown>) ?? {}, createdAt: d.createdAt.toISOString() }))}
  />
}
