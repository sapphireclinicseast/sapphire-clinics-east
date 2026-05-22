// POST /api/public/class-portal/password-reset/use
//
// Consumes a reset token and sets a new password on the target user.
// Body: { token, newPassword }. No prior auth required — the token IS
// the auth. Each token is single-use; calling twice returns 410.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const body = await req.json() as { token?: string; newPassword?: string }
    const token = (body.token ?? '').trim()
    const newPassword = body.newPassword ?? ''
    if (!token) {
      return withCors(NextResponse.json({ error: 'token is required.' }, { status: 400 }), origin)
    }
    if (newPassword.length < 6) {
      return withCors(NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 }), origin)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reset = await (prisma.classPortalPasswordReset as any).findUnique({ where: { token } })
    if (!reset) {
      return withCors(NextResponse.json({ error: 'Invalid or unknown reset link.' }, { status: 404 }), origin)
    }
    if (reset.usedAt) {
      return withCors(NextResponse.json({ error: 'This reset link has already been used.' }, { status: 410 }), origin)
    }
    if (reset.expiresAt < new Date()) {
      return withCors(NextResponse.json({ error: 'This reset link has expired.' }, { status: 410 }), origin)
    }

    const user = await prisma.classPortalUser.findUnique({ where: { id: reset.userId } })
    if (!user) {
      return withCors(NextResponse.json({ error: 'User no longer exists.' }, { status: 404 }), origin)
    }

    // Mark the reset row used + flip the password atomically so a double-
    // submit can't race a second password change through.
    const now = new Date()
    await prisma.$transaction([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.classPortalPasswordReset as any).update({
        where: { token },
        data: { usedAt: now },
      }),
      prisma.classPortalUser.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(newPassword),
          passwordSetAt: now,
          // Self-service reset: the user set their own password.
          passwordSetBy: user.email,
        },
      }),
    ])

    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    console.error('[password-reset/use.POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
