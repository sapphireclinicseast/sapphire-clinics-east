// POST /api/public/patients/login — self-service portal login.
// Body: { email, password } → { patientId, firstName, token } on success.
// Returns 401 for both unknown email and wrong password (no account enumeration).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { issuePatientToken } from '@/lib/patient-session'
import { verifyPassword } from '@/lib/patient-password'
import { preflight, withCors } from '../../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

type Body = { email?: string; password?: string }

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const body = (await req.json().catch(() => ({}))) as Body

  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''

  if (!email || !password) {
    return withCors(
      NextResponse.json({ error: 'Email and password are required' }, { status: 400 }),
      origin,
    )
  }

  const invalid = () =>
    withCors(
      NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 }),
      origin,
    )

  const patient = await prisma.patient.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, firstName: true, passwordHash: true },
  })

  // No account yet → let the UI route them to sign-up, but don't leak existence.
  if (!patient || !patient.passwordHash) return invalid()

  const ok = await verifyPassword(password, patient.passwordHash)
  if (!ok) return invalid()

  const token = issuePatientToken(patient.id)
  return withCors(
    NextResponse.json({ patientId: patient.id, firstName: patient.firstName, token }),
    origin,
  )
}
