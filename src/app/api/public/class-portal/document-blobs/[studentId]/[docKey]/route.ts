// GET /api/public/class-portal/document-blobs/[studentId]/[docKey]
//
// Class-portal-authed download of a parent-uploaded enrollment document.
// Students may only pull their own; teacher + admin (main and branch)
// may pull any student's blobs.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ studentId: string; docKey: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { studentId, docKey } = await params

    if (auth.role === 'STUDENT' && auth.userId !== studentId) {
      return withCors(NextResponse.json({ error: 'Students can only download their own documents.' }, { status: 403 }), origin)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalDocumentBlob as any).findUnique({
      where: { studentId_docKey: { studentId, docKey } },
    })
    if (!row) {
      return withCors(NextResponse.json({ error: 'Document not found.' }, { status: 404 }), origin)
    }
    const headers = new Headers({
      'content-type': row.fileType ?? 'application/octet-stream',
      'content-disposition': `inline; filename="${(row.fileName ?? 'document').replace(/["\\]/g, '_')}"`,
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
    console.error('[document-blobs/[studentId]/[docKey].GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ studentId: string; docKey: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { studentId, docKey } = await params
    if (auth.role !== 'ADMIN' && auth.role !== 'BRANCH_ADMIN') {
      return withCors(NextResponse.json({ error: 'Only admins can delete document blobs.' }, { status: 403 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalDocumentBlob as any).deleteMany({ where: { studentId, docKey } })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[document-blobs/[studentId]/[docKey].DELETE]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
