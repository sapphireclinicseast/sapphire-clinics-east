// PUT    /api/public/class-portal/lessons/[lessonId]/outputs/[studentId]
//   Teacher (or scoped admin) uploads one student's output for a lesson.
//   Multipart form fields:
//     file       — required, the student's work as image / PDF
//     makeupDate — optional ISO date when the student was absent and
//                  submitted later.
//
// GET    /api/public/class-portal/lessons/[lessonId]/outputs/[studentId]
//   Stream the bytes back. Visible to the student themselves, the
//   teacher of record, and admins in scope.
//
// DELETE /api/public/class-portal/lessons/[lessonId]/outputs/[studentId]
//   Teacher (or scoped admin) removes the student's output.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../../../_cors'
import { canSeeClass, canEditClass, classForLesson } from '../../../_lib'

const MAX_BYTES = 15 * 1024 * 1024

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ lessonId: string; studentId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { lessonId, studentId } = await params
    const { klass } = await classForLesson(lessonId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    if (!(klass.studentIds ?? []).includes(studentId)) {
      return withCors(NextResponse.json({ error: 'Student is not enrolled in this class.' }, { status: 400 }), origin)
    }

    const form = await req.formData()
    const f = form.get('file')
    const makeupDateStr = String(form.get('makeupDate') ?? '').trim()
    if (!(f instanceof File)) {
      return withCors(NextResponse.json({ error: 'Missing file field.' }, { status: 400 }), origin)
    }
    if (f.size > MAX_BYTES) {
      return withCors(NextResponse.json({ error: `File too large (${(f.size / 1024 / 1024).toFixed(1)}MB > 15MB).` }, { status: 413 }), origin)
    }
    const buf = Buffer.from(await f.arrayBuffer())
    const makeupDate = makeupDateStr ? new Date(makeupDateStr) : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalLessonOutput as any).upsert({
      where: { lessonId_studentId: { lessonId, studentId } },
      update: {
        fileName: f.name,
        fileType: f.type || 'application/octet-stream',
        fileSize: f.size,
        fileData: buf,
        makeupDate,
      },
      create: {
        lessonId,
        studentId,
        fileName: f.name,
        fileType: f.type || 'application/octet-stream',
        fileSize: f.size,
        fileData: buf,
        makeupDate,
      },
      select: { id: true, studentId: true, fileName: true, fileType: true, fileSize: true, makeupDate: true, updatedAt: true },
    })
    return withCors(NextResponse.json({
      output: {
        ...row,
        makeupDate: row.makeupDate ? row.makeupDate.toISOString() : null,
        updatedAt: row.updatedAt.toISOString(),
      },
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[lessons/outputs.PUT]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ lessonId: string; studentId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { lessonId, studentId } = await params
    const { klass } = await classForLesson(lessonId)
    // The student themselves OR anyone who can see the class.
    const isSelf = auth.role === 'STUDENT' && auth.userId === studentId
    if (!isSelf && !canSeeClass(auth, klass)) {
      return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalLessonOutput as any).findUnique({
      where: { lessonId_studentId: { lessonId, studentId } },
    })
    if (!row) return withCors(NextResponse.json({ error: 'Output not found.' }, { status: 404 }), origin)
    const bytes = row.fileData instanceof Buffer
      ? new Uint8Array(row.fileData.buffer, row.fileData.byteOffset, row.fileData.byteLength)
      : new Uint8Array(row.fileData as ArrayBuffer)
    const headers = new Headers({
      'content-type': row.fileType ?? 'application/octet-stream',
      'content-disposition': `inline; filename="${(row.fileName ?? 'output').replace(/["\\]/g, '_')}"`,
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
    console.error('[lessons/outputs.GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ lessonId: string; studentId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { lessonId, studentId } = await params
    const { klass } = await classForLesson(lessonId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalLessonOutput as any).deleteMany({ where: { lessonId, studentId } })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[lessons/outputs.DELETE]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
