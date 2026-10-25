// A signed-in patient attaching a file to one of their conversations.
//
// The same thing the public enquiry page already allows, for the same reasons:
// a parent describing a referral letter in words, when they are holding the
// letter, is work nobody needed. Authorised by the portal session rather than a
// link token, and otherwise identical — including that it reopens the thread,
// because a file is new work for the desk exactly as a reply is.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { linkedPatientIds } from '@/lib/patient-links'
import { storeInquiryFile, isProblem } from '@/lib/inquiry-upload'
import { preflight, withCors } from '../../../../_cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  const { id } = await params

  let form: FormData
  try { form = await req.formData() } catch {
    return withCors(NextResponse.json({ error: 'Could not read the upload.' }, { status: 400 }), origin)
  }

  const session = verifyPatientToken(String(form.get('token') ?? ''))
  if (!session) return withCors(NextResponse.json({ error: 'Not found' }, { status: 404 }), origin)

  const ids = await linkedPatientIds(session.patientId).catch(() => [session.patientId])
  const inq = await prisma.inquiry.findUnique({ where: { id } })
  // 404, not 403 — a patient should not learn that someone else's enquiry
  // exists by probing ids.
  if (!inq?.patientId || !ids.includes(inq.patientId)) {
    return withCors(NextResponse.json({ error: 'Not found' }, { status: 404 }), origin)
  }
  if (inq.status === 'CLOSED') {
    return withCors(NextResponse.json({ error: 'This conversation has been closed.' }, { status: 400 }), origin)
  }

  const file = form.get('file') as File | null
  if (!file) return withCors(NextResponse.json({ error: 'No file received.' }, { status: 400 }), origin)
  const caption = String(form.get('caption') ?? '').trim().slice(0, 5000)

  const stored = await storeInquiryFile(file)
  if (isProblem(stored)) {
    return withCors(NextResponse.json({ error: stored.error }, { status: stored.status }), origin)
  }

  await prisma.$transaction([
    prisma.inquiryMessage.create({
      data: { inquiryId: id, fromStaff: false, body: caption, ...stored },
    }),
    prisma.inquiry.update({
      where: { id },
      data: { status: 'OPEN', readAt: null, lastMessageAt: new Date() },
    }),
  ])

  return withCors(NextResponse.json({ ok: true }), origin)
}
