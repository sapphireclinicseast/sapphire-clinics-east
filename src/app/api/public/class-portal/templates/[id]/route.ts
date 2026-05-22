// DELETE /api/public/class-portal/templates/[id]

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
    const existing = await (prisma.classPortalTemplate as any).findUnique({ where: { id }, select: { uploadedBy: true } })
    if (!existing) {
      return withCors(NextResponse.json({ error: 'Not found.' }, { status: 404 }), origin)
    }
    const isAdmin = auth.role === 'ADMIN' || auth.role === 'BRANCH_ADMIN'
    if (!isAdmin && existing.uploadedBy !== auth.email) {
      return withCors(NextResponse.json({ error: 'You can only delete templates you uploaded.' }, { status: 403 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalTemplate as any).delete({ where: { id } })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[templates/[id].DELETE]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
