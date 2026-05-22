// GET  /api/public/class-portal/classes/[id]/activities
// POST /api/public/class-portal/classes/[id]/activities

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
    id: r.id, classId: r.classId, name: r.name, type: r.type, description: r.description,
    fromDate: r.fromDate ? r.fromDate.toISOString() : null,
    toDate: r.toDate ? r.toDate.toISOString() : null,
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
    const rows = await (prisma.classPortalActivity as any).findMany({
      where: { classId: id },
      orderBy: [{ fromDate: 'desc' }, { createdAt: 'desc' }],
    })
    // Bundle the photo metadata so the card can render thumbnails without
    // a per-row round-trip.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const photos = await (prisma.classPortalActivityPhoto as any).findMany({
      where: { activityId: { in: rows.map((r: { id: string }) => r.id) } },
      select: { id: true, activityId: true, fileName: true, fileType: true, fileSize: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    const byActivity = new Map<string, Array<{ id: string; fileName: string; fileType: string; fileSize: number; createdAt: string }>>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of photos) {
      const list = byActivity.get(p.activityId) ?? []
      list.push({ id: p.id, fileName: p.fileName, fileType: p.fileType, fileSize: p.fileSize, createdAt: p.createdAt.toISOString() })
      byActivity.set(p.activityId, list)
    }
    return withCors(NextResponse.json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activities: rows.map((r: any) => ({ ...serialize(r), photos: byActivity.get(r.id) ?? [] })),
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[activities.GET]', e)
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
      name?: string
      type?: string | null
      description?: string | null
      fromDate?: string | null
      toDate?: string | null
    }
    if (!body.name?.trim()) {
      return withCors(NextResponse.json({ error: 'name is required.' }, { status: 400 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalActivity as any).create({
      data: {
        classId: id,
        name: body.name.trim(),
        type: body.type?.trim() || null,
        description: body.description?.trim() || null,
        fromDate: body.fromDate ? new Date(body.fromDate) : null,
        toDate: body.toDate ? new Date(body.toDate) : null,
      },
    })
    return withCors(NextResponse.json({ activity: { ...serialize(row), photos: [] } }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[activities.POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
