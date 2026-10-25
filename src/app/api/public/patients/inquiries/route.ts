// The signed-in patient's own enquiries, for the client portal.
//
// Authorised by the same HMAC patient token every other /api/public/patients
// route uses — the portal's booking-proxy injects it from the HttpOnly cookie.
//
// Scoped to the patient AND their linked records, because a parent managing two
// children expects to see both without signing in twice.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { linkedPatientIds } from '@/lib/patient-links'
import { createInquiryWithRef } from '@/lib/inquiry-ref'
import { preflight, withCors } from '../../_cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

async function sessionPatientIds(token: string): Promise<string[] | null> {
  const session = verifyPatientToken(token)
  if (!session) return null
  return linkedPatientIds(session.patientId).catch(() => [session.patientId])
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const ids = await sessionPatientIds(req.nextUrl.searchParams.get('token') ?? '')
  if (!ids) return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)

  const inquiries = await prisma.inquiry.findMany({
    where: { patientId: { in: ids } },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
    select: {
      id: true, ref: true, branch: true, subject: true, status: true,
      lastMessageAt: true, createdAt: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, fromStaff: true } },
    },
  })

  return withCors(NextResponse.json({
    inquiries: inquiries.map(({ messages, ...rest }) => ({
      ...rest,
      preview: messages[0] ? { body: messages[0].body, fromStaff: messages[0].fromStaff } : null,
    })),
  }), origin)
}

/** Start a conversation from inside the portal. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const body = await req.json().catch(() => ({}))
  const session = verifyPatientToken(String(body.token ?? ''))
  if (!session) return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)

  const message = String(body.message ?? '').trim().slice(0, 5000)
  const branch = String(body.branch ?? '').trim().toUpperCase()
  if (!message) return withCors(NextResponse.json({ error: 'Message is required.' }, { status: 400 }), origin)

  const patient = await prisma.patient.findUnique({
    where: { id: session.patientId },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, branches: true, branch: true },
  })
  if (!patient) return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)

  // Fall back to the patient's own branch when they did not pick one — a
  // patient's enquiry belongs with the clinic that treats them.
  const OPS_TO_SHORT: Record<string, string> = { SANDBOX_EAST: 'SBEA', SANDBOX_GREENHILLS: 'SBGH' }
  const own = OPS_TO_SHORT[(patient.branches[0] ?? patient.branch ?? '') as string] ?? ''
  const chosen = ['SBEA', 'SBGH'].includes(branch) ? branch : own
  if (!chosen) {
    return withCors(NextResponse.json({ error: 'Please choose a branch.' }, { status: 400 }), origin)
  }

  const inquiry = await createInquiryWithRef({
    branch: chosen,
    name: `${patient.firstName} ${patient.lastName}`.trim(),
    email: patient.email,
    phone: patient.phone,
    body: message,
    patientId: patient.id,
  })

  return withCors(NextResponse.json({ ok: true, ref: inquiry.ref, id: inquiry.id }), origin)
}
