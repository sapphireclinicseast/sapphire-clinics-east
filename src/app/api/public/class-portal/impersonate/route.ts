// POST /api/public/class-portal/impersonate
//   Admin / Branch admin clicks "View as" on a user → server mints a
//   class-portal JWT for that target user, tagged with impersonatedBy so
//   the banner + audit log know who's actually driving. Branch admins
//   are scoped to users in their branch.
//
// PATCH /api/public/class-portal/impersonate
//   Admin clicks "Return to admin" → server stamps the impersonation log's
//   endedAt. The admin's own JWT is still in localStorage on the client;
//   they don't need a fresh one.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, signToken, verifyToken, bearerToken } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req, ['ADMIN', 'BRANCH_ADMIN'])
    // Refuse to nest impersonation — if the caller is already impersonating,
    // they must "Return to admin" before opening another.
    if (auth.impersonatedBy) {
      return withCors(NextResponse.json({ error: 'Already impersonating — return to admin before starting a new session.' }, { status: 409 }), origin)
    }
    const body = await req.json().catch(() => ({})) as { userId?: string; reason?: string }
    if (!body.userId) {
      return withCors(NextResponse.json({ error: 'userId is required.' }, { status: 400 }), origin)
    }
    const target = await prisma.classPortalUser.findUnique({ where: { id: body.userId } })
    if (!target) {
      return withCors(NextResponse.json({ error: 'User not found.' }, { status: 404 }), origin)
    }
    // Branch admins can only impersonate users in their own branch.
    if (auth.role === 'BRANCH_ADMIN' && target.branch && auth.branch && target.branch !== auth.branch) {
      return withCors(NextResponse.json({ error: 'Out of branch scope.' }, { status: 403 }), origin)
    }
    // Branch admins cannot be impersonated — would let a branch-admin
    // escalate themselves into another branch-admin's session. (Main ADMIN
    // is hardcoded and has no DB row, so it can't appear here anyway.)
    if (target.role === 'BRANCH_ADMIN') {
      return withCors(NextResponse.json({ error: 'Cannot impersonate branch admin accounts.' }, { status: 403 }), origin)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const log = await (prisma.classPortalImpersonationLog as any).create({
      data: {
        adminEmail: auth.email,
        targetUserId: target.id,
        targetEmail: target.email,
        targetRole: target.role,
        reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : null,
      },
    })

    const token = await signToken({
      role: target.role,
      userId: target.id,
      email: target.email,
      firstName: target.firstName ?? undefined,
      branch: (target.branch ?? undefined) as 'EAST' | 'GREENHILLS' | undefined,
      impersonatedBy: auth.email,
      impersonationLogId: log.id,
    })

    return withCors(NextResponse.json({
      token,
      logId: log.id,
      user: {
        id: target.id,
        role: target.role,
        email: target.email,
        firstName: target.firstName,
        lastName: target.lastName,
        branch: target.branch,
      },
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[impersonate.POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function PATCH(req: Request) {
  // Close-out: the client passes the impersonation token in Authorization
  // (so we can look up logId via the embedded claim) plus optionally the
  // logId in the body. Either path stamps endedAt; mismatches are ignored.
  const origin = req.headers.get('origin')
  try {
    const body = await req.json().catch(() => ({})) as { logId?: string }
    const tok = bearerToken(req)
    let logId = body.logId
    if (!logId && tok) {
      const payload = await verifyToken(tok)
      if (payload?.impersonationLogId) logId = payload.impersonationLogId
    }
    if (!logId) {
      return withCors(NextResponse.json({ ok: true, note: 'no log id supplied — nothing to close' }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalImpersonationLog as any).update({
      where: { id: logId },
      data: { endedAt: new Date() },
    })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    console.error('[impersonate.PATCH]', e)
    return withCors(NextResponse.json({ ok: true }), origin)
  }
}
