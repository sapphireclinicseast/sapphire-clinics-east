// POST /api/public/class-portal/activities/[activityId]/photos
//   Upload one photo at a time (multipart, field "file"). The UI can
//   call this in a loop for multi-file selections.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../../_cors'
import { canEditClass } from '../../../lessons/_lib'

const MAX_BYTES = 15 * 1024 * 1024

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ activityId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { activityId } = await params
    const { klass } = await ownerClass(activityId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    const form = await req.formData()
    const f = form.get('file')
    if (!(f instanceof File)) return withCors(NextResponse.json({ error: 'Missing file field.' }, { status: 400 }), origin)
    if (f.size > MAX_BYTES) return withCors(NextResponse.json({ error: 'File too large.' }, { status: 413 }), origin)
    const buf = Buffer.from(await f.arrayBuffer())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalActivityPhoto as any).create({
      data: {
        activityId,
        fileName: f.name,
        fileType: f.type || 'image/jpeg',
        fileSize: f.size,
        fileData: buf,
      },
      select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true },
    })
    return withCors(NextResponse.json({ photo: { ...row, createdAt: row.createdAt.toISOString() } }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[activity-photos.POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
