// PUT /api/public/class-portal/classes/[id]/photo
//   Upload a new cover photo (multipart, field name "file"). Replaces
//   any existing photo. Teacher of record + admins can write.
//
// GET /api/public/class-portal/classes/[id]/photo
//   Stream the stored photo bytes inline. Any user with read access to
//   the class (teacher, enrolled student, scoped admin) can fetch.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../../_cors'

const MAX_BYTES = 10 * 1024 * 1024 // 10MB cap on the cover photo

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function canSee(auth: { role: string; userId?: string; branch?: string }, row: any): boolean {
  if (auth.role === 'FRONTDESK') return false
  if (auth.role === 'ADMIN') return true
  if (auth.role === 'BRANCH_ADMIN') return !auth.branch || row.branch === auth.branch
  if (auth.role === 'TEACHER') return row.teacherId === auth.userId
  if (auth.role === 'STUDENT') return auth.userId ? (row.studentIds ?? []).includes(auth.userId) : false
  return false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function canEdit(auth: { role: string; userId?: string; branch?: string }, row: any): boolean {
  if (auth.role === 'ADMIN') return true
  if (auth.role === 'BRANCH_ADMIN') return !auth.branch || row.branch === auth.branch
  if (auth.role === 'TEACHER') return row.teacherId === auth.userId
  return false
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { id } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalClass as any).findUnique({
      where: { id },
      select: { teacherId: true, branch: true },
    })
    if (!row) return withCors(NextResponse.json({ error: 'Class not found.' }, { status: 404 }), origin)
    if (!canEdit(auth, row)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)

    const form = await req.formData()
    const f = form.get('file')
    if (!(f instanceof File)) {
      return withCors(NextResponse.json({ error: 'Missing file field.' }, { status: 400 }), origin)
    }
    if (f.size > MAX_BYTES) {
      return withCors(NextResponse.json({ error: `Photo too large (${(f.size / 1024 / 1024).toFixed(1)}MB > 10MB).` }, { status: 413 }), origin)
    }
    const buf = Buffer.from(await f.arrayBuffer())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalClass as any).update({
      where: { id },
      data: {
        photoFileName: f.name,
        photoFileType: f.type || 'image/jpeg',
        photoFileSize: f.size,
        photoFileData: buf,
        updatedAt: new Date(),
      },
    })
    return withCors(NextResponse.json({ ok: true, fileName: f.name, fileType: f.type, fileSize: f.size }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[classes/photo.PUT]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { id } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalClass as any).findUnique({
      where: { id },
      select: {
        teacherId: true, branch: true, studentIds: true,
        photoFileName: true, photoFileType: true, photoFileData: true,
      },
    })
    if (!row) return withCors(NextResponse.json({ error: 'Class not found.' }, { status: 404 }), origin)
    if (!canSee(auth, row)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    if (!row.photoFileName || !row.photoFileData) {
      return withCors(NextResponse.json({ error: 'No photo uploaded.' }, { status: 404 }), origin)
    }
    // Normalize Buffer → Uint8Array + Content-Length, same pattern as the
    // QR upload file endpoint (raw Buffer through NextResponse caused
    // blob() to hang on the client).
    const bytes = row.photoFileData instanceof Buffer
      ? new Uint8Array(row.photoFileData.buffer, row.photoFileData.byteOffset, row.photoFileData.byteLength)
      : new Uint8Array(row.photoFileData as ArrayBuffer)
    const headers = new Headers({
      'content-type': row.photoFileType ?? 'image/jpeg',
      'content-disposition': `inline; filename="${(row.photoFileName ?? 'class-photo').replace(/["\\]/g, '_')}"`,
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
    console.error('[classes/photo.GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
