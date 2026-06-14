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
import { auditEnrollment } from '@/lib/class-portal-audit'
import { withCors, corsHeaders } from '../../../../_cors'

const MAX_BYTES = 15 * 1024 * 1024 // 15MB cap

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const origin = req.headers.get('origin')
  let tokenForAudit = ''
  let auditMeta: Record<string, unknown> = {}
  try {
    const { token } = await params
    tokenForAudit = token
    if (!token) {
      void auditEnrollment({ kind: 'upload_token_complete', outcome: 'error', error: 'token missing', req })
      return withCors(NextResponse.json({ error: 'token required' }, { status: 400 }), origin)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalUploadToken as any).findUnique({ where: { token } })
    if (!row) {
      void auditEnrollment({ kind: 'upload_token_complete', outcome: 'error', error: 'token not found', req, metadata: { token } })
      return withCors(NextResponse.json({ error: 'Token not found.' }, { status: 404 }), origin)
    }
    auditMeta = { token, studentId: row.studentId, studentEmail: row.studentEmail, docKey: row.docKey }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      void auditEnrollment({ kind: 'upload_token_complete', email: row.studentEmail, studentId: row.studentId, docKey: row.docKey, outcome: 'error', error: 'token expired', req, metadata: auditMeta })
      return withCors(NextResponse.json({ error: 'Token expired.' }, { status: 410 }), origin)
    }

    const form = await req.formData()
    const f = form.get('file')
    if (!f || !(f instanceof File)) {
      void auditEnrollment({ kind: 'upload_token_complete', email: row.studentEmail, studentId: row.studentId, docKey: row.docKey, outcome: 'error', error: 'missing file field', req, metadata: auditMeta })
      return withCors(NextResponse.json({ error: 'Missing file field.' }, { status: 400 }), origin)
    }
    if (f.size > MAX_BYTES) {
      void auditEnrollment({ kind: 'upload_token_complete', email: row.studentEmail, studentId: row.studentId, docKey: row.docKey, outcome: 'error', error: `file too large: ${f.size}B`, req, metadata: { ...auditMeta, fileSize: f.size } })
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

    void auditEnrollment({
      kind: 'upload_token_complete',
      email: row.studentEmail,
      studentId: row.studentId,
      docKey: row.docKey,
      outcome: 'ok',
      req,
      metadata: { ...auditMeta, fileName: f.name, fileSize: f.size, fileType: f.type },
    })
    return withCors(NextResponse.json({
      ok: true,
      fileName: f.name,
      fileSize: f.size,
      fileType: f.type,
    }), origin)
  } catch (e) {
    console.error('[upload-tokens/file.POST]', e)
    void auditEnrollment({ kind: 'upload_token_complete', outcome: 'error', error: (e as Error).message, req, metadata: { token: tokenForAudit, ...auditMeta } })
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
    // Normalize to a Uint8Array with an explicit Content-Length so the
    // browser stops reading at the known size. Returning a raw Node Buffer
    // through NextResponse was getting wrapped as a ReadableStream with
    // chunked transfer encoding — the body bytes arrive but the stream
    // never signals "done", so blobRes.blob() in the QR-upload modal
    // hangs forever. Forcing a fixed-length response fixes the hang.
    const bytes = row.fileData instanceof Buffer
      ? new Uint8Array(row.fileData.buffer, row.fileData.byteOffset, row.fileData.byteLength)
      : new Uint8Array(row.fileData as ArrayBuffer)
    const cors = corsHeaders(origin)
    const headers = new Headers({
      'content-type': row.fileType ?? 'application/octet-stream',
      'content-disposition': `attachment; filename="${(row.fileName ?? 'upload').replace(/["\\]/g, '_')}"`,
      'content-length': String(bytes.byteLength),
      'cache-control': 'no-store',
      ...cors,
    })
    return new NextResponse(bytes, { status: 200, headers })
  } catch (e) {
    console.error('[upload-tokens/file.GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
