// PATCH  /api/public/class-portal/projects/[projectId]
// DELETE /api/public/class-portal/projects/[projectId]

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'
import { canEditClass } from '../../lessons/_lib'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

async function ownerClass(projectId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = await (prisma.classPortalProject as any).findUnique({ where: { id: projectId } })
  if (!project) throw new Response(JSON.stringify({ error: 'Project not found.' }), { status: 404 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const klass = await (prisma.classPortalClass as any).findUnique({ where: { id: project.classId } })
  if (!klass) throw new Response(JSON.stringify({ error: 'Parent class not found.' }), { status: 404 })
  return { project, klass }
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { projectId } = await params
    const { klass } = await ownerClass(projectId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    const body = await req.json() as {
      title?: string
      description?: string | null
      deadline?: string | null
      totalScore?: number
      grades?: Record<string, { score: number; makeupDate?: string }>
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { updatedAt: new Date() }
    if (body.title !== undefined) data.title = body.title.trim()
    if (body.description !== undefined) data.description = body.description?.trim() || null
    if (body.deadline !== undefined) data.deadline = body.deadline ? new Date(body.deadline) : null
    if (typeof body.totalScore === 'number') data.totalScore = body.totalScore
    if (body.grades !== undefined) data.grades = body.grades
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma.classPortalProject as any).update({ where: { id: projectId }, data })
    return withCors(NextResponse.json({ project: serialize(updated) }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[projects/[id].PATCH]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { projectId } = await params
    const { klass } = await ownerClass(projectId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    await prisma.$transaction([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.classPortalProjectProof as any).deleteMany({ where: { projectId } }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.classPortalProject as any).delete({ where: { id: projectId } }),
    ])
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[projects/[id].DELETE]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
