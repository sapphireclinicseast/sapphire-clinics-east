// GET    /api/public/class-portal/upload-tokens/[token]
//   Returns the token's metadata + whether the file has been uploaded
//   yet. No JWT auth — the token IS the auth (it's URL-safe random,
//   single-use, time-limited).
//
// DELETE /api/public/class-portal/upload-tokens/[token]
//   Cleanup after the desktop has ingested the file. Idempotent.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCors, corsHeaders } from '../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const { token } = await params
    if (!token) return withCors(NextResponse.json({ error: 'token required' }, { status: 400 }), origin)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalUploadToken as any).findUnique({
      where: { token },
      select: {
        token: true, studentId: true, studentEmail: true, docKey: true,
        expiresAt: true, fileName: true, fileType: true, fileSize: true,
        uploadedAt: true, createdAt: true,
      },
    })
    if (!row) return withCors(NextResponse.json({ error: 'Token not found.' }, { status: 404 }), origin)
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      return withCors(NextResponse.json({ error: 'Token expired.' }, { status: 410 }), origin)
    }
    return withCors(NextResponse.json({
      token: row.token,
      studentId: row.studentId,
      studentEmail: row.studentEmail,
      docKey: row.docKey,
      expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
      fileName: row.fileName,
      fileType: row.fileType,
      fileSize: row.fileSize,
      uploadedAt: row.uploadedAt ? (row.uploadedAt instanceof Date ? row.uploadedAt.toISOString() : row.uploadedAt) : null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    }), origin)
  } catch (e) {
    console.error('[upload-tokens.GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const { token } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalUploadToken as any).deleteMany({ where: { token } })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    console.error('[upload-tokens.DELETE]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
