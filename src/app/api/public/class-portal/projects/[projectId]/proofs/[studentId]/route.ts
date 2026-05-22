// PUT / GET / DELETE  /api/public/class-portal/projects/[projectId]/proofs/[studentId]

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../../../_cors'
import { canSeeClass, canEditClass } from '../../../../lessons/_lib'

const MAX_BYTES = 15 * 1024 * 1024

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

async function ownerClass(projectId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = await (prisma.classPortalProject as any).findUnique({ where: { id: projectId } })
  if (!project) throw new Response(JSON.stringify({ error: 'Project not found.' }), { status: 404 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const klass = await (prisma.classPortalClass as any).findUnique({ where: { id: project.classId } })
  if (!klass) throw new Response(JSON.stringify({ error: 'Parent class not found.' }), { status: 404 })
  return { project, klass }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ projectId: string; studentId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { projectId, studentId } = await params
    const { klass } = await ownerClass(projectId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    if (!(klass.studentIds ?? []).includes(studentId)) {
      return withCors(NextResponse.json({ error: 'Student is not enrolled in this class.' }, { status: 400 }), origin)
    }
    const form = await req.formData()
    const f = form.get('file')
    if (!(f instanceof File)) return withCors(NextResponse.json({ error: 'Missing file field.' }, { status: 400 }), origin)
    if (f.size > MAX_BYTES) return withCors(NextResponse.json({ error: `File too large.` }, { status: 413 }), origin)
    const buf = Buffer.from(await f.arrayBuffer())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalProjectProof as any).upsert({
      where: { projectId_studentId: { projectId, studentId } },
      update: { fileName: f.name, fileType: f.type || 'application/octet-stream', fileSize: f.size, fileData: buf },
      create: { projectId, studentId, fileName: f.name, fileType: f.type || 'application/octet-stream', fileSize: f.size, fileData: buf },
      select: { id: true, studentId: true, fileName: true, fileType: true, fileSize: true, updatedAt: true },
    })
    return withCors(NextResponse.json({ proof: { ...row, updatedAt: row.updatedAt.toISOString() } }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[project-proofs.PUT]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string; studentId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { projectId, studentId } = await params
    const { klass } = await ownerClass(projectId)
    const isSelf = auth.role === 'STUDENT' && auth.userId === studentId
    if (!isSelf && !canSeeClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalProjectProof as any).findUnique({
      where: { projectId_studentId: { projectId, studentId } },
    })
    if (!row) return withCors(NextResponse.json({ error: 'Proof not found.' }, { status: 404 }), origin)
    const bytes = row.fileData instanceof Buffer
      ? new Uint8Array(row.fileData.buffer, row.fileData.byteOffset, row.fileData.byteLength)
      : new Uint8Array(row.fileData as ArrayBuffer)
    const headers = new Headers({
      'content-type': row.fileType ?? 'application/octet-stream',
      'content-disposition': `inline; filename="${(row.fileName ?? 'proof').replace(/["\\]/g, '_')}"`,
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
    console.error('[project-proofs.GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ projectId: string; studentId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { projectId, studentId } = await params
    const { klass } = await ownerClass(projectId)
    if (!canEditClass(auth, klass)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalProjectProof as any).deleteMany({ where: { projectId, studentId } })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[project-proofs.DELETE]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
