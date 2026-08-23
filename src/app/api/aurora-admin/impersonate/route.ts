// POST /api/aurora-admin/impersonate — admin "view as patient".
// Given a patientId, issues a normal patient session token so an admin can open
// that patient's portal exactly as they see it (for debugging/preview). Token-
// authed server-to-server via AURORA_ADMIN_TOKEN (injected by the client-portal
// admin proxy). Passwords are never involved.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkAdminToken } from '@/lib/aurora-admin'
import { issuePatientToken } from '@/lib/patient-session'

export async function POST(req: NextRequest) {
  if (!checkAdminToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { patientId?: string }
  const patientId = (body.patientId ?? '').trim()
  if (!patientId) {
    return NextResponse.json({ error: 'patientId is required' }, { status: 400 })
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, firstName: true },
  })
  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  // Short-lived preview session (30 min) so an admin preview can't linger.
  const token = issuePatientToken(patient.id, 30 * 60)
  return NextResponse.json({ patientId: patient.id, firstName: patient.firstName, token })
}
