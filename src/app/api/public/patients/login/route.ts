// POST /api/public/patients/login — self-service portal login.
// Body: { username, password } → { patientId, firstName, token } on success.
// The identifier is a username (new accounts) or email (legacy accounts).
// Returns 401 for both unknown identifier and wrong password (no enumeration).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { issuePatientToken } from '@/lib/patient-session'
import { verifyPassword } from '@/lib/patient-password'
import { preflight, withCors } from '../../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

type Body = { username?: string; email?: string; password?: string }

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const body = (await req.json().catch(() => ({}))) as Body

  // Login field accepts a username (new accounts) or email (legacy accounts).
  const identifier = (body.username ?? body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''

  if (!identifier || !password) {
    return withCors(
      NextResponse.json({ error: 'Username and password are required' }, { status: 400 }),
      origin,
    )
  }

  const invalid = () =>
    withCors(
      NextResponse.json({ error: 'Incorrect username or password' }, { status: 401 }),
      origin,
    )

  // Match the identifier against username OR email (a shared email can map to
  // multiple siblings), then sign in as the one whose password verifies.
  const patients = await prisma.patient.findMany({
    where: {
      OR: [
        { username: { equals: identifier, mode: 'insensitive' } },
        { email: { equals: identifier, mode: 'insensitive' } },
      ],
    },
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
