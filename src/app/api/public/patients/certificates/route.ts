// GET /api/public/patients/certificates?token=…
// The signed-in patient's own discharge certificates.
//
// Read straight from this hub's database, which is also where the Patient CRM
// writes them — no second service, no shared key, nothing to be out of step.
// Widened across the person's interbranch records the same way their clinical
// documents are, so someone discharged at East whose record began at
// Greenhills still sees their certificate.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { linkedPatientIds } from '@/lib/patient-links'
import { preflight, withCors } from '../../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const session = verifyPatientToken(token)
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  const patientIds = await linkedPatientIds(session.patientId)
  const rows = await prisma.dischargeCertificate.findMany({
    where: { patientId: { in: patientIds } },
    // Newest first: a family looking for "the one from last month" reads down.
    orderBy: { dischargeDate: 'desc' },
    take: 100,
    // Narrower than the CRM's view on purpose — who issued it and when are
    // staff-facing facts a family has no use for.
    select: {
      id: true, service: true, awardedOn: true, dischargeDate: true,
      therapistName: true, managerName: true,
    },
  })

  return withCors(NextResponse.json({ certificates: rows }), origin)
}
