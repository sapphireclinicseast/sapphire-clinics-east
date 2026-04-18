// POST /api/public/patients/lookup
// Body: { email, lastName } — case-insensitive lookup of an existing patient.
// Returns a short-lived patient session token and the patient's firstName.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { issuePatientToken } from '@/lib/patient-session'
import { preflight, withCors } from '../../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const body = (await req.json().catch(() => ({}))) as {
    email?: string
    lastName?: string
  }
  const email = (body.email ?? '').trim().toLowerCase()
  const lastName = (body.lastName ?? '').trim().toLowerCase()
  if (!email || !lastName) {
    return withCors(
      NextResponse.json({ error: 'email and lastName are required' }, { status: 400 }),
      origin,
    )
  }

  // Prisma enum PatientType — scan all; Patient has email optional.
  const candidates = await prisma.patient.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true },
    take: 10,
  })
  const match = candidates.find((p) => (p.lastName ?? '').toLowerCase() === lastName)
  if (!match) {
    return withCors(NextResponse.json({ error: 'Not found' }, { status: 404 }), origin)
  }

  const token = issuePatientToken(match.id)
  return withCors(
    NextResponse.json({ patientId: match.id, firstName: match.firstName, token }),
    origin,
  )
}
