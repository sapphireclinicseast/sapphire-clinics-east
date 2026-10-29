// PATCH /api/public/class-portal/notifications/[id]
//   Mark one of the caller's notifications as read. Body: { read: boolean }.
//   The user can only patch their own rows — a stray id for someone else
//   returns 404.
//
// DELETE /api/public/class-portal/notifications/[id]
//   Dismiss / remove a notification from the inbox entirely.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (!auth.userId) {
      return withCors(NextResponse.json({ error: 'No personal inbox' }, { status: 404 }), origin)
    }
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({})) as { read?: boolean }
    const read = body.read !== false

    // Scope the update to the caller's rows so one user can't flip
    // another's bell state.
    const existing = await prisma.classPortalNotification.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true },
    })
    if (!existing) {
      return withCors(NextResponse.json({ error: 'Not found' }, { status: 404 }), origin)
    }

    const updated = await prisma.classPortalNotification.update({
      where: { id },
      data: { readAt: read ? new Date() : null },
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        href: true,
        readAt: true,
        createdAt: true,
      },
    })

    return withCors(NextResponse.json({
      notification: {
        ...updated,
        readAt: updated.readAt ? updated.readAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
      },
    }), origin)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = msg === 'Unauthorized' ? 401 : 500
    return withCors(NextResponse.json({ error: msg }, { status }), origin)
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (!auth.userId) {
      return withCors(NextResponse.json({ error: 'No personal inbox' }, { status: 404 }), origin)
    }
    const { id } = await ctx.params
    const existing = await prisma.classPortalNotification.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true },
    })
    if (!existing) {
      return withCors(NextResponse.json({ error: 'Not found' }, { status: 404 }), origin)
    }
    await prisma.classPortalNotification.delete({ where: { id } })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = msg === 'Unauthorized' ? 401 : 500
    return withCors(NextResponse.json({ error: msg }, { status }), origin)
  }
}
