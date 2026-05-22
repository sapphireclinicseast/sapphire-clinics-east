// GET    /api/public/class-portal/activities/[activityId]/photos/[photoId]
// DELETE /api/public/class-portal/activities/[activityId]/photos/[photoId]

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../../../_cors'
import { canSeeClass, canEditClass } from '../../../../lessons/_lib'

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ activityId: string; photoId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { activityId, photoId } = await params
    const { klass } = await ownerClass(activityId)
    if (!canSeeClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalActivityPhoto as any).findUnique({ where: { id: photoId } })
    if (!row || row.activityId !== activityId) {
      return withCors(NextResponse.json({ error: 'Photo not found.' }, { status: 404 }), origin)
    }
    const bytes = row.fileData instanceof Buffer
      ? new Uint8Array(row.fileData.buffer, row.fileData.byteOffset, row.fileData.byteLength)
      : new Uint8Array(row.fileData as ArrayBuffer)
    const headers = new Headers({
      'content-type': row.fileType ?? 'image/jpeg',
      'content-disposition': `inline; filename="${(row.fileName ?? 'photo').replace(/["\\]/g, '_')}"`,
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
    console.error('[activity-photo.GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ activityId: string; photoId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { activityId, photoId } = await params
    const { klass } = await ownerClass(activityId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalActivityPhoto as any).deleteMany({ where: { id: photoId, activityId } })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[activity-photo.DELETE]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
