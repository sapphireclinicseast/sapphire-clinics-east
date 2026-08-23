// Patient portal concern/support tickets.
//   POST /api/public/patients/tickets  — file a new concern (subject, description, optional screenshot)
//   GET  /api/public/patients/tickets?token=…  — list the signed-in patient's own tickets
// Auth is the patient HMAC token issued at login/register.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { preflight, withCors } from '../../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024 // ~5MB decoded

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const body = (await req.json().catch(() => ({}))) as {
    token?: string
    subject?: string
    description?: string
    screenshot?: string | null
  }
  const session = verifyPatientToken(body.token ?? '')
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  const subject = (body.subject ?? '').trim()
  const description = (body.description ?? '').trim()
  if (!subject || !description) {
    return withCors(
      NextResponse.json({ error: 'Subject and description are required.' }, { status: 400 }),
      origin,
    )
  }

  // Validate optional screenshot: image data URL, size-capped.
  let screenshot: string | null = null
  if (typeof body.screenshot === 'string' && body.screenshot.startsWith('data:image/')) {
    const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/s.exec(body.screenshot)
    if (m) {
      const bytes = Buffer.from(m[2], 'base64').length
      if (bytes > 0 && bytes <= MAX_SCREENSHOT_BYTES) screenshot = body.screenshot
    }
  }

  const ticket = await prisma.patientTicket.create({
    data: {
      patientId: session.patientId,
      subject: subject.slice(0, 200),
      description: description.slice(0, 5000),
      screenshot,
    },
    select: { id: true, createdAt: true },
  })

  return withCors(NextResponse.json({ ok: true, id: ticket.id }), origin)
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const session = verifyPatientToken(token)
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  const tickets = await prisma.patientTicket.findMany({
    where: { patientId: session.patientId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, subject: true, description: true, status: true,
      adminResponse: true, resolvedAt: true, createdAt: true,
    },
  })

  return withCors(
    NextResponse.json({
      tickets: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        description: t.description,
        status: t.status,
        adminResponse: t.adminResponse,
        resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
      })),
    }),
    origin,
  )
}
