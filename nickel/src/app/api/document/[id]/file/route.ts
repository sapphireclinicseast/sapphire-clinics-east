import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId, getSessionProviderId } from '@/lib/auth'

// Returns a document's file (generated PDF / uploaded PDF / photo) to its
// patient or its therapist only.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [patientId, providerId] = await Promise.all([getSessionPatientId(), getSessionProviderId()])
  if (!patientId && !providerId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const doc = await prisma.sessionDocument.findUnique({ where: { id }, select: { file: true, patientId: true, providerId: true } })
  if (!doc || !doc.file) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (doc.patientId !== patientId && doc.providerId !== providerId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  return NextResponse.json({ file: doc.file })
}
