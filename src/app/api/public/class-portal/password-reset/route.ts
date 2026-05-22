// POST /api/public/class-portal/password-reset
//   Admin (or branch admin) mints a one-shot reset link for a user
//   and emails it to them. Body: { userId }. Returns { ok: true }.
//
// GET  /api/public/class-portal/password-reset?token=...
//   Validates a token without consuming it. Returns the target user's
//   email + role so the /reset page can show "Set new password for X".
//   Returns 404 for unknown tokens, 410 for expired / already-used.

import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { sendTransactionalEmail } from '@/lib/transactional-email'
import { withCors, corsHeaders } from '../../_cors'

const TTL_HOURS = 24
const CLASS_PORTAL_URL = process.env.CLASS_PORTAL_URL || 'https://class.sapphireclinicseast.org'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req, ['ADMIN', 'BRANCH_ADMIN'])
    const body = await req.json() as { userId?: string }
    if (!body.userId) {
      return withCors(NextResponse.json({ error: 'userId is required.' }, { status: 400 }), origin)
    }
    const target = await prisma.classPortalUser.findUnique({ where: { id: body.userId } })
    if (!target) {
      return withCors(NextResponse.json({ error: 'User not found.' }, { status: 404 }), origin)
    }
    // Branch admins can only mint links for users in their own branch.
    if (auth.role === 'BRANCH_ADMIN' && target.branch && auth.branch && target.branch !== auth.branch) {
      return withCors(NextResponse.json({ error: 'Out of branch scope.' }, { status: 403 }), origin)
    }

    // 32 random bytes → 64-char hex. Plenty of entropy for a 24h one-shot
    // link, and short enough to fit comfortably in a URL.
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalPasswordReset as any).create({
      data: { userId: target.id, token, expiresAt, requestedBy: auth.email },
    })

    const link = `${CLASS_PORTAL_URL}/reset?token=${encodeURIComponent(token)}`
    const displayName = [target.firstName, target.lastName].filter(Boolean).join(' ') || target.email
    const subject = 'Set a new password for your Aura Academy account'
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
        <h2 style="color:#0f172a;margin:0 0 12px">Hi ${displayName},</h2>
        <p>A password reset was requested for your Aura Academy account at <strong>class.sapphireclinicseast.org</strong>.</p>
        <p>Click the button below to set a new password. The link is single-use and expires in ${TTL_HOURS} hours.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${link}" style="background:#3D6B62;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Set new password</a>
        </div>
        <p style="color:#64748b;font-size:13px">If the button doesn't work, copy this link into your browser:<br>${link}</p>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px">If you didn't request this, you can ignore the email — the link will expire on its own and nothing changes until you use it.</p>
      </div>`

    try {
      await sendTransactionalEmail({ to: target.email, subject, html })
    } catch (e) {
      console.error('[password-reset.POST] email send failed:', e)
      // Keep the token in the DB so the admin can manually share the link
      // if Resend is down. Surface a partial-success message.
      return withCors(NextResponse.json({
        ok: true,
        emailed: false,
        manualLink: link,
        warning: 'Could not send email — copy the link below and share it manually.',
      }), origin)
    }
    return withCors(NextResponse.json({ ok: true, emailed: true }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[password-reset.POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token') ?? ''
    if (!token) {
      return withCors(NextResponse.json({ error: 'token is required.' }, { status: 400 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reset = await (prisma.classPortalPasswordReset as any).findUnique({ where: { token } })
    if (!reset) {
      return withCors(NextResponse.json({ error: 'Invalid or unknown reset link.' }, { status: 404 }), origin)
    }
    if (reset.usedAt) {
      return withCors(NextResponse.json({ error: 'This reset link has already been used. Ask the admin for a new one.' }, { status: 410 }), origin)
    }
    if (reset.expiresAt < new Date()) {
      return withCors(NextResponse.json({ error: 'This reset link has expired. Ask the admin for a new one.' }, { status: 410 }), origin)
    }
    const user = await prisma.classPortalUser.findUnique({ where: { id: reset.userId } })
    if (!user) {
      return withCors(NextResponse.json({ error: 'User no longer exists.' }, { status: 404 }), origin)
    }
    return withCors(NextResponse.json({
      user: {
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      expiresAt: reset.expiresAt.toISOString(),
    }), origin)
  } catch (e) {
    console.error('[password-reset.GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
