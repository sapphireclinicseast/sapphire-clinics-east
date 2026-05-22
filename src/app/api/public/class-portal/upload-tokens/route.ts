// POST /api/public/class-portal/upload-tokens
//
// Class portal /documents creates a one-time token for QR-from-phone
// upload. The desktop renders a QR code encoding /upload/<token>; the
// parent scans it on their phone, uploads a file via the token-scoped
// endpoint, the desktop polls + ingests.
//
// No JWT auth required — this is also called from the mid-enrollment
// /documents flow before the new-student account is fully signed in.
// The token itself is the security boundary (URL-safe random, 30-min
// TTL, single-use). The studentId/email are tagged on for observability
// but not gate-checked.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCors, corsHeaders } from '../../_cors'

const TOKEN_TTL_MS = 30 * 60 * 1000 // 30 minutes

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

function randomToken(): string {
  // URL-safe 24-char token. Cryptographically random — fine for a single-
  // use, time-limited handoff.
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  let s = btoa(String.fromCharCode(...bytes))
  s = s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return s
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const body = await req.json() as { studentId?: string; studentEmail?: string; docKey?: string }
    if (!body.docKey) {
      return withCors(NextResponse.json({ error: 'docKey is required.' }, { status: 400 }), origin)
    }

    const token = randomToken()
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalUploadToken as any).create({
      data: {
        token,
        studentId: body.studentId ?? 'pending',
        studentEmail: body.studentEmail ?? 'pending',
        docKey: body.docKey,
        expiresAt,
      },
    })

    return withCors(NextResponse.json({ token, expiresAt: expiresAt.toISOString() }), origin)
  } catch (e) {
    console.error('[upload-tokens.POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
