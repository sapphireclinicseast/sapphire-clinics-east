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

  // A single parent email is often shared by siblings, so check every patient
  // with this email and sign in as the one whose password matches.
  const patients = await prisma.patient.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, firstName: true, passwordHash: true },
  })

  for (const p of patients) {
    if (p.passwordHash && (await verifyPassword(password, p.passwordHash))) {
      const token = issuePatientToken(p.id)
      return withCors(
        NextResponse.json({ patientId: p.id, firstName: p.firstName, token }),
        origin,
      )
    }
  }
  return invalid()
}
