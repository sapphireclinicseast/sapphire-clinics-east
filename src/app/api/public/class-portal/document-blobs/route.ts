// GET  /api/public/class-portal/document-blobs?studentId=...
//   Lists docKey metadata (no file bytes) for the given student. Used by
//   the class-portal client to detect which docs are missing on the server
//   and silently re-sync the parent's local IndexedDB copies — recovers
//   from the legacy state where server-blob sync wasn't yet shipped.
//
// POST /api/public/class-portal/document-blobs
//
// Permanent server-side storage for parent-uploaded enrollment documents.
// Called by /documents on submit (alongside the existing IndexedDB write)
// so the partner-school /admission tracker can download these later.
// A second upload for the same (studentId, docKey) replaces the first.
//
// Multipart fields:
//   file       — the file body (max 15 MB)
//   studentId  — class-portal user id
//   docKey     — e.g. psa_birth_cert, report_card_sf9, parent_valid_id
//
// Auth: class-portal JWT. Students can only upload for themselves; admin
// + branch admin can upload for any student.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../_cors'

const MAX_BYTES = 15 * 1024 * 1024 // 15MB cap

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const url = new URL(req.url)
    const studentId = (url.searchParams.get('studentId') ?? '').trim()
    if (!studentId) {
      return withCors(NextResponse.json({ error: 'studentId is required.' }, { status: 400 }), origin)
    }
    if (auth.role === 'STUDENT' && auth.userId !== studentId) {
      return withCors(NextResponse.json({ error: 'Students can only list their own documents.' }, { status: 403 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma.classPortalDocumentBlob as any).findMany({
      where: { studentId },
      select: { docKey: true, fileName: true, fileSize: true, fileType: true, updatedAt: true },
    })
    return withCors(NextResponse.json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      blobs: rows.map((r: any) => ({
        docKey: r.docKey,
        fileName: r.fileName,
        fileSize: r.fileSize,
        fileType: r.fileType,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
      })),
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[document-blobs.GET list]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const form = await req.formData()
    const f = form.get('file')
    const studentId = String(form.get('studentId') ?? '').trim()
    const docKey = String(form.get('docKey') ?? '').trim()

    if (!studentId || !docKey) {
      return withCors(NextResponse.json({ error: 'studentId and docKey are required.' }, { status: 400 }), origin)
    }
    if (!f || !(f instanceof File)) {
      return withCors(NextResponse.json({ error: 'Missing file field.' }, { status: 400 }), origin)
    }
    if (f.size > MAX_BYTES) {
      return withCors(NextResponse.json({ error: `File too large (${(f.size / 1024 / 1024).toFixed(1)}MB > 15MB).` }, { status: 413 }), origin)
    }

    // Students can only write to their own row.
    if (auth.role === 'STUDENT' && auth.userId !== studentId) {
      return withCors(NextResponse.json({ error: 'Students can only upload their own documents.' }, { status: 403 }), origin)
    }
    if (auth.role === 'TEACHER') {
      return withCors(NextResponse.json({ error: 'Teachers cannot upload documents.' }, { status: 403 }), origin)
    }

    const buf = Buffer.from(await f.arrayBuffer())
    const fileType = f.type || 'application/octet-stream'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalDocumentBlob as any).upsert({
      where: { studentId_docKey: { studentId, docKey } },
      update: {
        fileName: f.name,
        fileType,
        fileSize: f.size,
        fileData: buf,
        uploadedBy: auth.email,
      },
      create: {
        studentId,
        docKey,
        fileName: f.name,
        fileType,
        fileSize: f.size,
        fileData: buf,
        uploadedBy: auth.email,
      },
    })

    return withCors(NextResponse.json({
      blob: {
        id: row.id,
        studentId: row.studentId,
        docKey: row.docKey,
        fileName: row.fileName,
        fileType: row.fileType,
        fileSize: row.fileSize,
        uploadedBy: row.uploadedBy,
        updatedAt: row.updatedAt.toISOString(),
      },
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[document-blobs.POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
