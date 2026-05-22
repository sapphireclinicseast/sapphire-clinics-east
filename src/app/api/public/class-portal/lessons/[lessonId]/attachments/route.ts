// POST /api/public/class-portal/lessons/[lessonId]/attachments
//   Upload a reference file to a lesson (multipart, field "file"). One
//   call per file. The lesson detail endpoint already returns the list.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../../_cors'
import { canEditClass, classForLesson } from '../../_lib'

const MAX_BYTES = 25 * 1024 * 1024

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { lessonId } = await params
    const { klass } = await classForLesson(lessonId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)

    const form = await req.formData()
    const f = form.get('file')
    if (!(f instanceof File)) {
      return withCors(NextResponse.json({ error: 'Missing file field.' }, { status: 400 }), origin)
    }
    if (f.size > MAX_BYTES) {
      return withCors(NextResponse.json({ error: `File too large (${(f.size / 1024 / 1024).toFixed(1)}MB > 25MB).` }, { status: 413 }), origin)
    }
    const buf = Buffer.from(await f.arrayBuffer())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalLessonAttachment as any).create({
      data: {
        lessonId,
        fileName: f.name,
        fileType: f.type || 'application/octet-stream',
        fileSize: f.size,
        fileData: buf,
      },
      select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true },
    })
    return withCors(NextResponse.json({
      attachment: { ...row, createdAt: row.createdAt.toISOString() },
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[lessons/attachments.POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
