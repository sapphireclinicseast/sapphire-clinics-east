// GET  /api/public/class-portal/classes/[id]/projects
// POST /api/public/class-portal/classes/[id]/projects

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../../_cors'
import { canSeeClass, canEditClass } from '../../../lessons/_lib'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(r: any) {
  return {
    id: r.id, classId: r.classId, title: r.title, description: r.description,
    deadline: r.deadline ? r.deadline.toISOString() : null,
    totalScore: r.totalScore, grades: r.grades ?? {},
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
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
    const rows = await (prisma.classPortalProject as any).findMany({
      where: { classId: id },
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
    })
    return withCors(NextResponse.json({ projects: rows.map(serialize) }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[projects.GET]', e)
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
      title?: string
      description?: string | null
      deadline?: string | null
      totalScore?: number
      grades?: Record<string, { score: number; makeupDate?: string }>
    }
    if (!body.title?.trim() || typeof body.totalScore !== 'number') {
      return withCors(NextResponse.json({ error: 'title and totalScore are required.' }, { status: 400 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalProject as any).create({
      data: {
        classId: id,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        deadline: body.deadline ? new Date(body.deadline) : null,
        totalScore: body.totalScore,
        grades: body.grades ?? {},
      },
    })
    return withCors(NextResponse.json({ project: serialize(row) }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[projects.POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
