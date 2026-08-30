import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId, getSessionProviderId, getSessionDoctorId } from '@/lib/auth'

// Returns a document's file (generated PDF / uploaded PDF / photo) to its
// patient, its therapist, or its rehab doctor only.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [patientId, providerId, doctorId] = await Promise.all([getSessionPatientId(), getSessionProviderId(), getSessionDoctorId()])
  if (!patientId && !providerId && !doctorId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const doc = await prisma.sessionDocument.findUnique({ where: { id }, select: { file: true, patientId: true, providerId: true, doctorId: true } })
  if (!doc || !doc.file) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (doc.patientId !== patientId && doc.providerId !== providerId && doc.doctorId !== doctorId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  return NextResponse.json({ file: doc.file })
}
