// POST /api/public/class-portal/notifications/mark-all-read
//   Mark all of the caller's unread notifications as read in one call.
//   Response: { updated: number }

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (!auth.userId) {
      return withCors(NextResponse.json({ updated: 0 }), origin)
    }
    const result = await prisma.classPortalNotification.updateMany({
      where: { userId: auth.userId, readAt: null },
      data: { readAt: new Date() },
    })
    return withCors(NextResponse.json({ updated: result.count }), origin)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = msg === 'Unauthorized' ? 401 : 500
    return withCors(NextResponse.json({ error: msg }, { status }), origin)
  }
}
