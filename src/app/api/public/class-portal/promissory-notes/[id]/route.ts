// GET    /api/public/class-portal/promissory-notes/[id]  — stream the file
// DELETE /api/public/class-portal/promissory-notes/[id]  — remove the note
//
// Both are staff-only (ADMIN, BRANCH_ADMIN, FRONTDESK). Teachers and
// students get 403. Branch admins + front desk may only touch notes in
// their own branch.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, type ClassPortalRole } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'

const STAFF_ROLES: ClassPortalRole[] = ['ADMIN', 'BRANCH_ADMIN', 'FRONTDESK']

function isStaffRole(role: ClassPortalRole): boolean {
  return STAFF_ROLES.includes(role)
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (!isStaffRole(auth.role)) {
      return withCors(NextResponse.json({ error: 'Promissory notes are restricted to admins and front desk.' }, { status: 403 }), origin)
    }
    const { id } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalPromissoryNote as any).findUnique({
      where: { id },
    })
    if (!row) {
      return withCors(NextResponse.json({ error: 'Note not found.' }, { status: 404 }), origin)
    }
    if (auth.role !== 'ADMIN' && auth.branch && row.branch !== auth.branch) {
      return withCors(NextResponse.json({ error: 'Note is in another branch.' }, { status: 403 }), origin)
    }
    const headers = new Headers({
      'content-type': row.fileType ?? 'application/octet-stream',
      'content-disposition': `inline; filename="${(row.fileName ?? 'promissory-note').replace(/["\\]/g, '_')}"`,
      'cache-control': 'no-store',
      ...corsHeaders(origin),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(row.fileData as any, { status: 200, headers })
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[promissory-notes/[id].GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (!isStaffRole(auth.role)) {
      return withCors(NextResponse.json({ error: 'Only admins and front desk can delete promissory notes.' }, { status: 403 }), origin)
    }
    const { id } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalPromissoryNote as any).findUnique({
      where: { id }, select: { id: true, branch: true },
    })
    if (!row) {
      return withCors(NextResponse.json({ error: 'Note not found.' }, { status: 404 }), origin)
    }
    if (auth.role !== 'ADMIN' && auth.branch && row.branch !== auth.branch) {
      return withCors(NextResponse.json({ error: 'Note is in another branch.' }, { status: 403 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalPromissoryNote as any).delete({ where: { id } })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[promissory-notes/[id].DELETE]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
