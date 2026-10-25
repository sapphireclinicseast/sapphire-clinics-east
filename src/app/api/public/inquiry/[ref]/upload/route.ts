// The enquirer attaching a file to their own thread.
//
// Authorised by the token in their link, exactly as the reply route is: a ref
// is sequential and guessable, so it must never be enough on its own.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { storeInquiryFile, isProblem } from '@/lib/inquiry-upload'
import { preflight, withCors } from '../../../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const origin = req.headers.get('origin')
  const { ref } = await params

  let form: FormData
  try { form = await req.formData() } catch {
    return withCors(NextResponse.json({ error: 'Could not read the upload.' }, { status: 400 }), origin)
  }
  const token = String(form.get('token') ?? '')
  const file = form.get('file') as File | null
  const caption = String(form.get('caption') ?? '').trim().slice(0, 5000)

  const inq = await prisma.inquiry.findUnique({ where: { ref } })
  // 404 on a bad token, never 403 — a 403 would confirm the ref exists.
  if (!inq || !token || inq.token !== token) {
    return withCors(NextResponse.json({ error: 'Not found' }, { status: 404 }), origin)
  }
  if (inq.status === 'CLOSED') {
    return withCors(NextResponse.json({ error: 'This enquiry has been closed.' }, { status: 400 }), origin)
  }
  if (!file) return withCors(NextResponse.json({ error: 'No file received.' }, { status: 400 }), origin)

  const stored = await storeInquiryFile(file)
  if (isProblem(stored)) {
    return withCors(NextResponse.json({ error: stored.error }, { status: stored.status }), origin)
  }

  await prisma.$transaction([
    prisma.inquiryMessage.create({
      data: { inquiryId: inq.id, fromStaff: false, body: caption, ...stored },
    }),
    // New work for the desk, same as a text reply.
    prisma.inquiry.update({
      where: { id: inq.id },
      data: { status: 'OPEN', readAt: null, lastMessageAt: new Date() },
    }),
  ])

  return withCors(NextResponse.json({ ok: true }), origin)
}
