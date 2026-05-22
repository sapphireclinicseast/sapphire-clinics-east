// PATCH  /api/public/class-portal/activities/[activityId]
// DELETE /api/public/class-portal/activities/[activityId]

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'
import { canEditClass } from '../../lessons/_lib'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

async function ownerClass(activityId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activity = await (prisma.classPortalActivity as any).findUnique({ where: { id: activityId } })
  if (!activity) throw new Response(JSON.stringify({ error: 'Activity not found.' }), { status: 404 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const klass = await (prisma.classPortalClass as any).findUnique({ where: { id: activity.classId } })
  if (!klass) throw new Response(JSON.stringify({ error: 'Parent class not found.' }), { status: 404 })
  return { activity, klass }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(r: any) {
  return {
    id: r.id, classId: r.classId, name: r.name, type: r.type, description: r.description,
    fromDate: r.fromDate ? r.fromDate.toISOString() : null,
    toDate: r.toDate ? r.toDate.toISOString() : null,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ activityId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { activityId } = await params
    const { klass } = await ownerClass(activityId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    const body = await req.json() as {
      name?: string
      type?: string | null
      description?: string | null
      fromDate?: string | null
      toDate?: string | null
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { updatedAt: new Date() }
    if (body.name !== undefined) data.name = body.name.trim()
    if (body.type !== undefined) data.type = body.type?.trim() || null
    if (body.description !== undefined) data.description = body.description?.trim() || null
    if (body.fromDate !== undefined) data.fromDate = body.fromDate ? new Date(body.fromDate) : null
    if (body.toDate !== undefined) data.toDate = body.toDate ? new Date(body.toDate) : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma.classPortalActivity as any).update({ where: { id: activityId }, data })
    return withCors(NextResponse.json({ activity: serialize(updated) }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[activities/[id].PATCH]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ activityId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { activityId } = await params
    const { klass } = await ownerClass(activityId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    await prisma.$transaction([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.classPortalActivityPhoto as any).deleteMany({ where: { activityId } }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.classPortalActivity as any).delete({ where: { id: activityId } }),
    ])
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[activities/[id].DELETE]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
