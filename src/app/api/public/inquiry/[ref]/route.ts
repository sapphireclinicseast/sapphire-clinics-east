// The enquirer's own view of their thread, and their replies.
//
// Authorisation is the token in the link and nothing else — refs are
// sequential and therefore guessable, so a ref on its own must never open a
// thread. Both handlers compare the token and 404 (not 403) on a mismatch, so
// a wrong token cannot be used to confirm that a ref exists.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { preflight, withCors } from '../../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

async function load(ref: string, token: string | null) {
  if (!ref || !token) return null
  const inq = await prisma.inquiry.findUnique({
    where: { ref },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!inq || inq.token !== token) return null
  return inq
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const origin = req.headers.get('origin')
  const { ref } = await params
  const inq = await load(ref, req.nextUrl.searchParams.get('token'))
  if (!inq) return withCors(NextResponse.json({ error: 'Not found' }, { status: 404 }), origin)

  return withCors(NextResponse.json({
    ref: inq.ref,
    branch: inq.branch,
    name: inq.name,
    subject: inq.subject,
    status: inq.status,
    createdAt: inq.createdAt,
    messages: inq.messages.map((m) => ({
      fromStaff: m.fromStaff,
      // Staff replies are attributed to the branch, not to the individual who
      // typed them — the enquirer is talking to the clinic.
      author: m.fromStaff ? (m.authorName || 'Front Desk') : inq.name,
      body: m.body,
      createdAt: m.createdAt,
      fileUrl: m.fileUrl,
      fileName: m.fileName,
      fileMime: m.fileMime,
      fileSize: m.fileSize,
    })),
  }), origin)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const origin = req.headers.get('origin')
  const { ref } = await params
  const body = await req.json().catch(() => ({}))
  const inq = await load(ref, (body.token as string) || req.nextUrl.searchParams.get('token'))
  if (!inq) return withCors(NextResponse.json({ error: 'Not found' }, { status: 404 }), origin)

  const text = typeof body.message === 'string' ? body.message.trim().slice(0, 5000) : ''
  if (!text) {
    return withCors(NextResponse.json({ error: 'Message is required.' }, { status: 400 }), origin)
  }
  if (inq.status === 'CLOSED') {
    return withCors(NextResponse.json(
      { error: 'This enquiry has been closed. Please start a new one.' }, { status: 400 }), origin)
  }

  await prisma.$transaction([
    prisma.inquiryMessage.create({
      data: { inquiryId: inq.id, fromStaff: false, body: text },
    }),
    // Back to OPEN and unread: a reply from the enquirer is new work for the
    // desk even if someone had already answered once.
    prisma.inquiry.update({
      where: { id: inq.id },
      data: { status: 'OPEN', readAt: null, lastMessageAt: new Date() },
    }),
  ])

  return withCors(NextResponse.json({ ok: true }), origin)
}
