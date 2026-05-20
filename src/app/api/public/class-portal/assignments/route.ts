// GET /api/public/class-portal/assignments       — any authenticated role. Returns the full assignment list.
// PUT /api/public/class-portal/assignments       — admin only. Body { assignments: [{ teacherId, branch, level }, ...] }
//                                                  — replaces ALL existing assignments with the supplied set.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

function jsonError(origin: string | null, e: unknown): NextResponse {
  if (e instanceof Response) {
    const headers = new Headers(e.headers)
    for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
    return new NextResponse(e.body, { status: e.status, headers })
  }
  return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    await requireAuth(req)
    const rows = await prisma.classPortalTeacherAssignment.findMany({
      orderBy: [{ teacherId: 'asc' }, { branch: 'asc' }, { level: 'asc' }],
    })
    return withCors(NextResponse.json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assignments: rows.map((r: any) => ({
        id: r.id,
        teacherId: r.teacherId,
        branch: r.branch,
        level: r.level,
      })),
    }), origin)
  } catch (e) { return jsonError(origin, e) }
}

export async function PUT(req: Request) {
  const origin = req.headers.get('origin')
  try {
    await requireAuth(req, ['ADMIN'])
    const body = await req.json() as {
      assignments: Array<{ teacherId: string; branch: 'EAST' | 'GREENHILLS'; level: string }>
    }
    if (!Array.isArray(body.assignments)) {
      return withCors(NextResponse.json({ error: 'assignments must be an array.' }, { status: 400 }), origin)
    }
    // Replace the full set atomically.
    await prisma.$transaction([
      prisma.classPortalTeacherAssignment.deleteMany({}),
      prisma.classPortalTeacherAssignment.createMany({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: body.assignments.map(a => ({ teacherId: a.teacherId, branch: a.branch, level: a.level }) as any),
        skipDuplicates: true,
      }),
    ])
    const rows = await prisma.classPortalTeacherAssignment.findMany({
      orderBy: [{ teacherId: 'asc' }, { branch: 'asc' }, { level: 'asc' }],
    })
    return withCors(NextResponse.json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assignments: rows.map((r: any) => ({
        id: r.id,
        teacherId: r.teacherId,
        branch: r.branch,
        level: r.level,
      })),
    }), origin)
  } catch (e) { return jsonError(origin, e) }
}
