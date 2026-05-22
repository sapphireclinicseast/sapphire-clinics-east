// GET    /api/public/class-portal/lessons/[lessonId]/attachments/[attId]
//   Stream the attachment bytes (Content-Length set, same fixed-length
//   pattern used by every other class-portal blob endpoint).
//
// DELETE /api/public/class-portal/lessons/[lessonId]/attachments/[attId]
//   Teacher + scoped admins remove one attachment.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../../../_cors'
import { canSeeClass, canEditClass, classForLesson } from '../../../_lib'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ lessonId: string; attId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { lessonId, attId } = await params
    const { klass } = await classForLesson(lessonId)
    if (!canSeeClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalLessonAttachment as any).findUnique({ where: { id: attId } })
    if (!row || row.lessonId !== lessonId) {
      return withCors(NextResponse.json({ error: 'Attachment not found.' }, { status: 404 }), origin)
    }
    const bytes = row.fileData instanceof Buffer
      ? new Uint8Array(row.fileData.buffer, row.fileData.byteOffset, row.fileData.byteLength)
      : new Uint8Array(row.fileData as ArrayBuffer)
    const headers = new Headers({
      'content-type': row.fileType ?? 'application/octet-stream',
      'content-disposition': `inline; filename="${(row.fileName ?? 'attachment').replace(/["\\]/g, '_')}"`,
      'content-length': String(bytes.byteLength),
      'cache-control': 'no-store',
      ...corsHeaders(origin),
    })
    return new NextResponse(bytes, { status: 200, headers })
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[lessons/attachments/[id].GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ lessonId: string; attId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { lessonId, attId } = await params
    const { klass } = await classForLesson(lessonId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalLessonAttachment as any).deleteMany({ where: { id: attId, lessonId } })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[lessons/attachments/[id].DELETE]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
