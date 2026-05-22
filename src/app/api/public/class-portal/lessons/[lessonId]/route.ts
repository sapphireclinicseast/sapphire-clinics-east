// GET    /api/public/class-portal/lessons/[lessonId]
//   Single lesson fetch + attachment + output metadata. Visible if the
//   caller can see the parent class.
//
// PATCH  /api/public/class-portal/lessons/[lessonId]
//   Update title / description / attendance / hasStudentOutput /
//   gradeTotal / grades. Teacher of record + scoped admins only.
//
// DELETE /api/public/class-portal/lessons/[lessonId]
//   Removes the lesson + all its attachments + all student outputs.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'
import { canSeeClass, canEditClass, classForLesson } from '../_lib'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(r: any) {
  return {
    id: r.id,
    classId: r.classId,
    lessonDate: r.lessonDate instanceof Date ? r.lessonDate.toISOString() : r.lessonDate,
    title: r.title,
    description: r.description,
    attendance: r.attendance ?? {},
    hasStudentOutput: !!r.hasStudentOutput,
    gradeTotal: r.gradeTotal ?? null,
    grades: r.grades ?? {},
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { lessonId } = await params
    const { klass, lesson } = await classForLesson(lessonId)
    if (!canSeeClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attachments = await (prisma.classPortalLessonAttachment as any).findMany({
      where: { lessonId },
      select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outputs = await (prisma.classPortalLessonOutput as any).findMany({
      where: { lessonId },
      select: { id: true, studentId: true, fileName: true, fileType: true, fileSize: true, makeupDate: true, updatedAt: true },
    })
    return withCors(NextResponse.json({
      lesson: serialize(lesson),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attachments: attachments.map((a: any) => ({ ...a, createdAt: a.createdAt.toISOString() })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      outputs: outputs.map((o: any) => ({
        ...o,
        makeupDate: o.makeupDate ? o.makeupDate.toISOString() : null,
        updatedAt: o.updatedAt.toISOString(),
      })),
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[lessons/[id].GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { lessonId } = await params
    const { klass } = await classForLesson(lessonId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)

    const body = await req.json() as {
      title?: string
      description?: string | null
      lessonDate?: string
      attendance?: Record<string, 'PRESENT' | 'ABSENT'>
      hasStudentOutput?: boolean
      gradeTotal?: number | null
      grades?: Record<string, { score: number; makeupDate?: string }>
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { updatedAt: new Date() }
    if (body.title !== undefined) data.title = body.title.trim()
    if (body.description !== undefined) data.description = body.description?.trim() || null
    if (body.lessonDate !== undefined) {
      const d = new Date(body.lessonDate)
      if (!Number.isNaN(d.getTime())) data.lessonDate = d
    }
    if (body.attendance !== undefined) data.attendance = body.attendance
    if (body.hasStudentOutput !== undefined) data.hasStudentOutput = !!body.hasStudentOutput
    if (body.gradeTotal !== undefined) data.gradeTotal = typeof body.gradeTotal === 'number' ? body.gradeTotal : null
    if (body.grades !== undefined) data.grades = body.grades

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma.classPortalLesson as any).update({ where: { id: lessonId }, data })
    return withCors(NextResponse.json({ lesson: serialize(updated) }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[lessons/[id].PATCH]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { lessonId } = await params
    const { klass } = await classForLesson(lessonId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)

    // Cascade: clear attachments + outputs first.
    await prisma.$transaction([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.classPortalLessonAttachment as any).deleteMany({ where: { lessonId } }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.classPortalLessonOutput as any).deleteMany({ where: { lessonId } }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.classPortalLesson as any).delete({ where: { id: lessonId } }),
    ])
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[lessons/[id].DELETE]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
