// POST /api/public/class-portal/upload-tokens/[token]/file
//   Phone scans the QR, lands on /upload/<token>, picks a file, POSTs
//   it here as multipart/form-data with field name "file".
//
// GET  /api/public/class-portal/upload-tokens/[token]/file
//   Desktop polls the parent endpoint until uploadedAt is set, then
//   fetches the blob via this endpoint and drops it in IndexedDB.
//
// No JWT auth on either — the token itself is the auth (URL-safe random,
// 30-min TTL, single-use).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCors, corsHeaders } from '../../../../_cors'

const MAX_BYTES = 15 * 1024 * 1024 // 15MB cap

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const { token } = await params
    if (!token) return withCors(NextResponse.json({ error: 'token required' }, { status: 400 }), origin)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalUploadToken as any).findUnique({ where: { token } })
    if (!row) return withCors(NextResponse.json({ error: 'Token not found.' }, { status: 404 }), origin)
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      return withCors(NextResponse.json({ error: 'Token expired.' }, { status: 410 }), origin)
    }

    const form = await req.formData()
    const f = form.get('file')
    if (!f || !(f instanceof File)) {
      return withCors(NextResponse.json({ error: 'Missing file field.' }, { status: 400 }), origin)
    }
    if (f.size > MAX_BYTES) {
      return withCors(NextResponse.json({ error: `File too large (${(f.size / 1024 / 1024).toFixed(1)}MB > 15MB).` }, { status: 413 }), origin)
    }
    const buf = Buffer.from(await f.arrayBuffer())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalUploadToken as any).update({
      where: { token },
      data: {
        fileName: f.name,
        fileType: f.type || 'application/octet-stream',
        fileSize: f.size,
        fileData: buf,
        uploadedAt: new Date(),
      },
    })

    return withCors(NextResponse.json({
      ok: true,
      fileName: f.name,
      fileSize: f.size,
      fileType: f.type,
    }), origin)
  } catch (e) {
    console.error('[upload-tokens/file.POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const { token } = await params
    if (!token) return withCors(NextResponse.json({ error: 'token required' }, { status: 400 }), origin)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalUploadToken as any).findUnique({
      where: { token },
      select: { fileName: true, fileType: true, fileData: true, uploadedAt: true, expiresAt: true },
    })
    if (!row || !row.fileData || !row.uploadedAt) {
      return withCors(NextResponse.json({ error: 'No file uploaded yet.' }, { status: 404 }), origin)
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      return withCors(NextResponse.json({ error: 'Token expired.' }, { status: 410 }), origin)
    }
    const cors = corsHeaders(origin)
    const headers = new Headers({
      'content-type': row.fileType ?? 'application/octet-stream',
      'content-disposition': `attachment; filename="${(row.fileName ?? 'upload').replace(/["\\]/g, '_')}"`,
      'cache-control': 'no-store',
      ...cors,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(row.fileData as any, { status: 200, headers })
  } catch (e) {
    console.error('[upload-tokens/file.GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
