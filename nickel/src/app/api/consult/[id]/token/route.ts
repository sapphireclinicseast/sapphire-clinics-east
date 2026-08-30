import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId, getSessionDoctorId } from '@/lib/auth'
import { livekitConfigured, livekitUrl, mintConsultToken } from '@/lib/livekit'

// Join token for a teleconsult room. Only the consult's patient or doctor, and
// only while the consult is paid/confirmed, can join.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [patientId, doctorId] = await Promise.all([getSessionPatientId(), getSessionDoctorId()])
  if (!patientId && !doctorId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const c = await prisma.consult.findUnique({
    where: { id },
    include: { patient: { select: { firstName: true, lastName: true } }, doctor: { select: { firstName: true, lastName: true } } },
  })
  if (!c) return NextResponse.json({ error: 'Consult not found' }, { status: 404 })

  const isPatient = patientId && c.patientId === patientId
  const isDoctor = doctorId && c.doctorId === doctorId
  if (!isPatient && !isDoctor) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (c.mode !== 'TELECONSULT') return NextResponse.json({ error: 'This consult is in person.' }, { status: 409 })
  if (!['PAID', 'CONFIRMED', 'COMPLETED'].includes(c.status)) return NextResponse.json({ error: 'This consult isn’t ready yet.' }, { status: 409 })
  if (!livekitConfigured()) return NextResponse.json({ error: 'Teleconsult video is not configured yet. Please contact Nickel support.' }, { status: 503 })

  const room = c.roomName || `nickel-consult-${c.id}`
  const identity = isDoctor ? `doctor-${c.doctorId}` : `patient-${c.patientId}`
  const name = isDoctor ? `Dr. ${c.doctor.firstName} ${c.doctor.lastName}` : `${c.patient.firstName} ${c.patient.lastName}`
  const token = await mintConsultToken(room, identity, name)
  return NextResponse.json({ token, url: livekitUrl(), room, role: isDoctor ? 'DOCTOR' : 'PATIENT' })
}
