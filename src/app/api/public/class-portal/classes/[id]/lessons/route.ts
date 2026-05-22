// GET  /api/public/class-portal/classes/[id]/lessons
//   List lessons for a class (visible if the caller can see the class).
//
// POST /api/public/class-portal/classes/[id]/lessons
//   Teacher / scoped admin creates a new lesson. lessonDate must fall
//   on one of the parent class's scheduleDays.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../../_cors'
import { canSeeClass, canEditClass, lessonDateMatchesSchedule } from '../../../lessons/_lib'

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { id } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const klass = await (prisma.classPortalClass as any).findUnique({ where: { id } })
    if (!klass) return withCors(NextResponse.json({ error: 'Class not found.' }, { status: 404 }), origin)
    if (!canSeeClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma.classPortalLesson as any).findMany({
      where: { classId: id },
      orderBy: [{ lessonDate: 'desc' }],
    })
    return withCors(NextResponse.json({ lessons: rows.map(serialize) }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[lessons.GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { id } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const klass = await (prisma.classPortalClass as any).findUnique({ where: { id } })
    if (!klass) return withCors(NextResponse.json({ error: 'Class not found.' }, { status: 404 }), origin)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)

    const body = await req.json() as {
      lessonDate?: string
      title?: string
      description?: string | null
      attendance?: Record<string, 'PRESENT' | 'ABSENT'>
      hasStudentOutput?: boolean
      gradeTotal?: number | null
      grades?: Record<string, { score: number; makeupDate?: string }>
    }
    if (!body.lessonDate || !body.title?.trim()) {
      return withCors(NextResponse.json({ error: 'lessonDate and title are required.' }, { status: 400 }), origin)
    }
    const lessonDate = new Date(body.lessonDate)
    if (Number.isNaN(lessonDate.getTime())) {
      return withCors(NextResponse.json({ error: 'Invalid lessonDate.' }, { status: 400 }), origin)
    }
    if (klass.scheduleDays && klass.scheduleDays.length > 0 && !lessonDateMatchesSchedule(lessonDate, klass.scheduleDays)) {
      return withCors(NextResponse.json({ error: 'Lesson date must fall on one of the class scheduled days.' }, { status: 400 }), origin)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalLesson as any).create({
      data: {
        classId: id,
        lessonDate,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        attendance: body.attendance ?? {},
        hasStudentOutput: !!body.hasStudentOutput,
        gradeTotal: typeof body.gradeTotal === 'number' ? body.gradeTotal : null,
        grades: body.grades ?? {},
      },
    })
    return withCors(NextResponse.json({ lesson: serialize(row) }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[lessons.POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
