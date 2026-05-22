// PATCH  /api/public/class-portal/tests/[testId]
// DELETE /api/public/class-portal/tests/[testId]

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'
import { canEditClass, classForLesson } from '../../lessons/_lib'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

async function ownerClass(testId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const test = await (prisma.classPortalLessonTest as any).findUnique({ where: { id: testId } })
  if (!test) throw new Response(JSON.stringify({ error: 'Test not found.' }), { status: 404 })
  const { klass } = await classForLesson(test.lessonId)
  return { test, klass }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(r: any) {
  return {
    id: r.id, lessonId: r.lessonId, title: r.title,
    totalPoints: r.totalPoints, scores: r.scores ?? {},
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ testId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { testId } = await params
    const { klass } = await ownerClass(testId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    const body = await req.json() as {
      title?: string
      totalPoints?: number
      scores?: Record<string, { score: number; makeupDate?: string }>
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { updatedAt: new Date() }
    if (body.title !== undefined) data.title = body.title.trim()
    if (typeof body.totalPoints === 'number') data.totalPoints = body.totalPoints
    if (body.scores !== undefined) data.scores = body.scores
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma.classPortalLessonTest as any).update({ where: { id: testId }, data })
    return withCors(NextResponse.json({ test: serialize(updated) }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[tests/[id].PATCH]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ testId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { testId } = await params
    const { klass } = await ownerClass(testId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    await prisma.$transaction([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.classPortalLessonTestProof as any).deleteMany({ where: { testId } }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.classPortalLessonTest as any).delete({ where: { id: testId } }),
    ])
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[tests/[id].DELETE]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
