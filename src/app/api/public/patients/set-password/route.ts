// POST /api/public/patients/set-password — returning patient who is already in
// the CRM but has no portal login yet "claims" their account by setting a password.
// Body: { email, firstName, lastName, password }. Verified by email + last name
// (first name only disambiguates siblings who share an email and surname).
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

type Body = { email?: string; firstName?: string; lastName?: string; password?: string }

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const body = (await req.json().catch(() => ({}))) as Body

  const email = (body.email ?? '').trim().toLowerCase()
  const firstName = (body.firstName ?? '').trim()
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

  // A single parent email is often shared by siblings, so match on email + last
  // name, then disambiguate by first name when more than one record shares that
  // surname under the same email.
  const candidates = await prisma.patient.findMany({
    where: {
      email: { equals: email, mode: 'insensitive' },
      lastName: { equals: lastName, mode: 'insensitive' },
    },
    select: { id: true, firstName: true, passwordHash: true },
  })

  let patient: (typeof candidates)[number] | undefined
  if (candidates.length === 1) {
    patient = candidates[0]
  } else if (candidates.length > 1 && firstName) {
    const fn = firstName.toLowerCase()
    patient = candidates.find((p) => {
      const pf = p.firstName.toLowerCase()
      return pf === fn || pf.startsWith(fn) || fn.startsWith(pf)
    })
  }

  if (!patient) {
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
