// GET /api/public/class-portal/notifications
//   Returns the current user's bell-icon notifications, newest first.
//   Query params:
//     ?limit=20  (default 20, capped at 50)
//     ?unread=1  (only unread rows)
//
//   Response: { notifications: Notification[], unreadCount: number }

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const url = new URL(req.url)
    const limitRaw = Number(url.searchParams.get('limit') || 20)
    const limit = Math.min(50, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20))
    const unreadOnly = url.searchParams.get('unread') === '1'

    // The hardcoded-password frontdesk account signs in without a userId
    // bound to a ClassPortalUser row — it predates the DB-backed accounts.
    // No row means no personal inbox; return empty rather than erroring.
    if (!auth.userId) {
      return withCors(NextResponse.json({ notifications: [], unreadCount: 0 }), origin)
    }

    const where = {
      userId: auth.userId,
      ...(unreadOnly ? { readAt: null } : {}),
    }
    const [rows, unreadCount] = await Promise.all([
      prisma.classPortalNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          kind: true,
          title: true,
          body: true,
          href: true,
          readAt: true,
          createdAt: true,
        },
      }),
      prisma.classPortalNotification.count({
        where: { userId: auth.userId, readAt: null },
      }),
    ])

    return withCors(NextResponse.json({
      notifications: rows.map(r => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.body,
        href: r.href,
        readAt: r.readAt ? r.readAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
      unreadCount,
    }), origin)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = msg === 'Unauthorized' ? 401 : 500
    return withCors(NextResponse.json({ error: msg }, { status }), origin)
  }
}
