// GET  /api/public/class-portal/lessons/[lessonId]/tests
// POST /api/public/class-portal/lessons/[lessonId]/tests

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../../_cors'
import { canSeeClass, canEditClass, classForLesson } from '../../_lib'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(r: any) {
  return {
    id: r.id,
    lessonId: r.lessonId,
    title: r.title,
    totalPoints: r.totalPoints,
    scores: r.scores ?? {},
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { lessonId } = await params
    const { klass } = await classForLesson(lessonId)
    if (!canSeeClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma.classPortalLessonTest as any).findMany({
      where: { lessonId },
      orderBy: { createdAt: 'asc' },
    })
    return withCors(NextResponse.json({ tests: rows.map(serialize) }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[lesson-tests.GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { lessonId } = await params
    const { klass } = await classForLesson(lessonId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)

    const body = await req.json() as {
      title?: string
      totalPoints?: number
      scores?: Record<string, { score: number; makeupDate?: string }>
    }
    if (!body.title?.trim() || typeof body.totalPoints !== 'number') {
      return withCors(NextResponse.json({ error: 'title and totalPoints are required.' }, { status: 400 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalLessonTest as any).create({
      data: {
        lessonId,
        title: body.title.trim(),
        totalPoints: body.totalPoints,
        scores: body.scores ?? {},
      },
    })
    return withCors(NextResponse.json({ test: serialize(row) }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[lesson-tests.POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
