// POST /api/public/patients/set-password — returning patient who is already in
// the CRM but has no portal login yet "claims" their account by setting a password.
// Body: { email, lastName, password }. Verified by email + last name match.
//   200 → { patientId, firstName, token }
//   404 → no matching record (UI should route them to "register as new patient")
//   409 → an account already exists (UI should route them to "sign in")

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { issuePatientToken } from '@/lib/patient-session'
import { hashPassword, validatePassword } from '@/lib/patient-password'
import { preflight, withCors } from '../../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

type Body = { email?: string; lastName?: string; password?: string }

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const body = (await req.json().catch(() => ({}))) as Body

  const email = (body.email ?? '').trim().toLowerCase()
  const lastName = (body.lastName ?? '').trim()
  const password = body.password ?? ''

  if (!email || !lastName) {
    return withCors(
      NextResponse.json({ error: 'Email and last name are required' }, { status: 400 }),
      origin,
    )
  }
  const pwErr = validatePassword(password)
  if (pwErr) {
    return withCors(NextResponse.json({ error: pwErr }, { status: 400 }), origin)
  }

  const patient = await prisma.patient.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true, passwordHash: true },
  })

  if (!patient || patient.lastName.toLowerCase() !== lastName.toLowerCase()) {
    return withCors(
      NextResponse.json(
        { error: 'No matching record found. Please register as a new patient.' },
        { status: 404 },
      ),
      origin,
    )
  }
  if (patient.passwordHash) {
    return withCors(
      NextResponse.json(
        { error: 'An account already exists for this email. Please sign in instead.' },
        { status: 409 },
      ),
      origin,
    )
  }

  await prisma.patient.update({
    where: { id: patient.id },
    data: { passwordHash: await hashPassword(password) },
  })

  const token = issuePatientToken(patient.id)
  return withCors(
    NextResponse.json({ patientId: patient.id, firstName: patient.firstName, token }),
    origin,
  )
}
