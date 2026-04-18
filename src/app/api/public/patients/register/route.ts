// POST /api/public/patients/register — open patient self-registration.
// Body: { firstName, lastName, email, phone?, branch, patientType }

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
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
    branch?: 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS'
    patientType?: 'PEDIATRIC' | 'ADULT'
  }
  const firstName = (body.firstName ?? '').trim()
  const lastName = (body.lastName ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  const phone = (body.phone ?? '').trim() || null
  const branch = body.branch
  const patientType = body.patientType

  if (!firstName || !lastName || !email || !branch || !patientType) {
    return withCors(
      NextResponse.json(
        { error: 'firstName, lastName, email, branch, patientType are required' },
        { status: 400 },
      ),
      origin,
    )
  }
  if (branch !== 'SANDBOX_EAST' && branch !== 'SANDBOX_GREENHILLS') {
    return withCors(NextResponse.json({ error: 'invalid branch' }, { status: 400 }), origin)
  }
  if (patientType !== 'PEDIATRIC' && patientType !== 'ADULT') {
    return withCors(NextResponse.json({ error: 'invalid patientType' }, { status: 400 }), origin)
  }

  // If an existing patient with same email + lastName exists, return it (merge flow).
  const existing = await prisma.patient.findFirst({
    where: {
      email: { equals: email, mode: 'insensitive' },
    },
    select: { id: true, firstName: true, lastName: true },
  })
  if (existing && existing.lastName.toLowerCase() === lastName.toLowerCase()) {
    const token = issuePatientToken(existing.id)
    return withCors(
      NextResponse.json({
        patientId: existing.id,
        firstName: existing.firstName,
        token,
        reused: true,
      }),
      origin,
    )
  }

  const created = await prisma.patient.create({
    data: {
      firstName,
      lastName,
      email,
      phone,
      branch,
      branches: [branch],
      patientType,
    },
    select: { id: true, firstName: true },
  })
  const token = issuePatientToken(created.id)
  return withCors(
    NextResponse.json({ patientId: created.id, firstName: created.firstName, token }),
    origin,
  )
}
