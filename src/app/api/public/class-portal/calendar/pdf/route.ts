// GET  /api/public/class-portal/calendar/pdf       — any authenticated role; streams the latest PDF bytes.
// GET  /api/public/class-portal/calendar/pdf?meta=1 — returns only metadata as JSON.
// POST /api/public/class-portal/calendar/pdf       — admin/teacher; multipart upload (form field "file"); replaces previous.
// DELETE /api/public/class-portal/calendar/pdf     — admin/teacher; removes the current PDF.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'

const MAX_PDF_BYTES = 8 * 1024 * 1024 // 8 MB

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

function jsonError(origin: string | null, e: unknown): NextResponse {
  if (e instanceof Response) {
    const headers = new Headers(e.headers)
    for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
    return new NextResponse(e.body, { status: e.status, headers })
  }
  return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
}

async function getCurrentPdf() {
  return prisma.classPortalCalendarPdf.findFirst({ orderBy: [{ uploadedAt: 'desc' }] })
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    await requireAuth(req)
    const url = new URL(req.url)
    const current = await getCurrentPdf()
    if (!current) {
      // 204 No Content when nothing's uploaded yet — client treats that as "no calendar PDF".
      return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
    }
    if (url.searchParams.get('meta')) {
      return withCors(NextResponse.json({
        meta: {
          id: current.id,
          fileName: current.fileName,
          mimeType: current.mimeType,
          uploadedBy: current.uploadedBy,
          uploadedAt: current.uploadedAt.toISOString(),
          size: current.data.byteLength,
        },
      }), origin)
    }
    // Stream the bytes back as the PDF.
    const headers = new Headers(corsHeaders(origin))
    headers.set('content-type', current.mimeType || 'application/pdf')
    headers.set('content-disposition', `inline; filename="${current.fileName}"`)
    headers.set('cache-control', 'private, no-cache')
    return new NextResponse(new Uint8Array(current.data) as BodyInit, { status: 200, headers })
  } catch (e) { return jsonError(origin, e) }
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req, ['ADMIN', 'TEACHER'])
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return withCors(NextResponse.json({ error: 'No file uploaded.' }, { status: 400 }), origin)
    }
    if (file.size === 0) {
      return withCors(NextResponse.json({ error: 'File is empty.' }, { status: 400 }), origin)
    }
    if (file.size > MAX_PDF_BYTES) {
      return withCors(NextResponse.json({ error: 'PDF too large (max 8 MB).' }, { status: 413 }), origin)
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    // Replace previous PDFs (single canonical version).
    await prisma.classPortalCalendarPdf.deleteMany({})
    const created = await prisma.classPortalCalendarPdf.create({
      data: {
        fileName: file.name || 'calendar.pdf',
        mimeType: file.type || 'application/pdf',
        data: bytes,
        uploadedBy: auth.email,
      },
    })
    return withCors(NextResponse.json({
      meta: {
        id: created.id,
        fileName: created.fileName,
        mimeType: created.mimeType,
        uploadedBy: created.uploadedBy,
        uploadedAt: created.uploadedAt.toISOString(),
        size: created.data.byteLength,
      },
    }), origin)
  } catch (e) { return jsonError(origin, e) }
}

export async function DELETE(req: Request) {
  const origin = req.headers.get('origin')
  try {
    await requireAuth(req, ['ADMIN', 'TEACHER'])
    await prisma.classPortalCalendarPdf.deleteMany({})
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) { return jsonError(origin, e) }
}
