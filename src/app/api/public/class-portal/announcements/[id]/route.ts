// DELETE /api/public/class-portal/announcements/[id]
//   Admin can delete any announcement. Teachers can delete the ones
//   they authored. Anyone else gets 403.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { id } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma as any).classPortalAnnouncement.findUnique({
      where: { id },
      select: { id: true, authorEmail: true },
    })
    if (!existing) {
      return withCors(NextResponse.json({ error: 'Announcement not found.' }, { status: 404 }), origin)
    }
    if (auth.role !== 'ADMIN' && !(auth.role === 'TEACHER' && existing.authorEmail === auth.email)) {
      return withCors(NextResponse.json({ error: 'You can only delete announcements you authored, unless you are the main admin.' }, { status: 403 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).classPortalAnnouncement.delete({ where: { id } })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[announcements DELETE]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
