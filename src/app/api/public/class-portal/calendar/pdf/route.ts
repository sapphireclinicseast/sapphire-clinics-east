// GET    /api/public/class-portal/calendar/pdf?branch=EAST|GREENHILLS         — streams the PDF bytes for that branch
// GET    /api/public/class-portal/calendar/pdf?branch=EAST|GREENHILLS&meta=1   — returns only metadata as JSON
// POST   /api/public/class-portal/calendar/pdf                                 — admin/teacher; multipart upload; field "file" + "branch"
// DELETE /api/public/class-portal/calendar/pdf?branch=EAST|GREENHILLS          — admin/teacher; removes that branch's PDF
//
// STUDENT/BRANCH_ADMIN/FRONTDESK auto-scope to their own branch and
// ignore the query param. ADMIN/TEACHER use the query param and default
// to EAST when omitted.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'

type Branch = 'EAST' | 'GREENHILLS'

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

function isBranch(s: unknown): s is Branch {
  return s === 'EAST' || s === 'GREENHILLS'
}

async function resolveReadBranch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auth: any,
  paramBranch: string | null,
): Promise<Branch | null> {
  if (auth.role === 'STUDENT') {
    const u = await prisma.classPortalUser.findUnique({
      where: { id: auth.userId },
      select: { branch: true },
    })
    return isBranch(u?.branch) ? u!.branch as Branch : null
  }
  if (auth.role === 'BRANCH_ADMIN' || auth.role === 'FRONTDESK') {
    return isBranch(auth.branch) ? auth.branch : null
  }
  return isBranch(paramBranch) ? paramBranch : 'EAST'
}

async function getBranchPdf(branch: Branch) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma.classPortalCalendarPdf as any).findUnique({ where: { branch } })
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const url = new URL(req.url)
    const branch = await resolveReadBranch(auth, url.searchParams.get('branch'))
    if (!branch) {
      return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
    }
    const current = await getBranchPdf(branch)
    if (!current) {
      return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
    }
    if (url.searchParams.get('meta')) {
      return withCors(NextResponse.json({
        meta: {
          id: current.id,
          branch: current.branch,
          fileName: current.fileName,
          mimeType: current.mimeType,
          uploadedBy: current.uploadedBy,
          uploadedAt: current.uploadedAt.toISOString(),
          size: current.data.byteLength,
        },
      }), origin)
    }
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
    const branchRaw = String(form.get('branch') ?? '')
    if (!isBranch(branchRaw)) {
      return withCors(NextResponse.json({ error: 'branch is required (EAST or GREENHILLS).' }, { status: 400 }), origin)
    }
    const branch: Branch = branchRaw
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
    const fileName = file.name || 'calendar.pdf'
    const mimeType = file.type || 'application/pdf'
    // Upsert by branch — each branch holds at most one current PDF.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await (prisma.classPortalCalendarPdf as any).upsert({
      where: { branch },
      update: { fileName, mimeType, data: bytes, uploadedBy: auth.email, uploadedAt: new Date() },
      create: { branch, fileName, mimeType, data: bytes, uploadedBy: auth.email },
    })
    return withCors(NextResponse.json({
      meta: {
        id: created.id,
        branch: created.branch,
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
    const url = new URL(req.url)
    const branchRaw = url.searchParams.get('branch')
    if (!isBranch(branchRaw)) {
      return withCors(NextResponse.json({ error: 'branch is required (EAST or GREENHILLS).' }, { status: 400 }), origin)
    }
    await prisma.classPortalCalendarPdf.deleteMany({ where: { branch: branchRaw } })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) { return jsonError(origin, e) }
}
