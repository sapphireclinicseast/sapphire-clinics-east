// One of the signed-in patient's conversations: read it, or add to it.
//
// Every handler re-checks that the enquiry belongs to this session's patient.
// Loading by id alone would let any signed-in patient read anyone's thread.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { linkedPatientIds } from '@/lib/patient-links'
import { preflight, withCors } from '../../../_cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

async function authorise(token: string, id: string) {
  const session = verifyPatientToken(token)
  if (!session) return null
  const ids = await linkedPatientIds(session.patientId).catch(() => [session.patientId])
  const inquiry = await prisma.inquiry.findUnique({ where: { id } })
  // 404 rather than 403 — a patient should not learn that someone else's
  // enquiry exists by probing ids.
  if (!inquiry || !inquiry.patientId || !ids.includes(inquiry.patientId)) return null
  return inquiry
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  const { id } = await params
  const inq = await authorise(req.nextUrl.searchParams.get('token') ?? '', id)
  if (!inq) return withCors(NextResponse.json({ error: 'Not found' }, { status: 404 }), origin)

  const messages = await prisma.inquiryMessage.findMany({
    where: { inquiryId: id }, orderBy: { createdAt: 'asc' },
  })
  return withCors(NextResponse.json({
    ref: inq.ref, branch: inq.branch, subject: inq.subject, status: inq.status,
    createdAt: inq.createdAt,
    messages: messages.map((m) => ({
      fromStaff: m.fromStaff,
      // Attributed to the clinic, not the individual who typed it.
      author: m.fromStaff ? (m.authorName || 'Front Desk') : 'You',
      body: m.body,
      createdAt: m.createdAt,
      fileUrl: m.fileUrl, fileName: m.fileName, fileMime: m.fileMime, fileSize: m.fileSize,
    })),
  }), origin)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const inq = await authorise(String(body.token ?? ''), id)
  if (!inq) return withCors(NextResponse.json({ error: 'Not found' }, { status: 404 }), origin)

  const text = String(body.message ?? '').trim().slice(0, 5000)
  if (!text) return withCors(NextResponse.json({ error: 'Message is required.' }, { status: 400 }), origin)
  if (inq.status === 'CLOSED') {
    return withCors(NextResponse.json({ error: 'This conversation has been closed.' }, { status: 400 }), origin)
  }

  await prisma.$transaction([
    prisma.inquiryMessage.create({ data: { inquiryId: id, fromStaff: false, body: text } }),
    // Unread again — the same thread the front desk already has open, so a
    // portal reply is not a new conversation, it is new work on an old one.
    prisma.inquiry.update({
      where: { id },
      data: { status: 'OPEN', readAt: null, lastMessageAt: new Date() },
    }),
  ])
  return withCors(NextResponse.json({ ok: true }), origin)
}
