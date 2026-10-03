// Promissory notes for class-portal tuition.
//
// GET  /api/public/class-portal/promissory-notes
//   List metadata (no file bytes) for every student the viewer can see.
//   Optional ?studentId=… to filter to one student. Scope:
//     ADMIN       → every branch
//     BRANCH_ADMIN → own branch
//     FRONTDESK   → own branch
//     TEACHER / STUDENT / anyone else → 403.
//
// POST /api/public/class-portal/promissory-notes
//   Multipart upload. Fields: file, studentId, notes (optional).
//   Rejects over 100 MB. Rejects a 6th note for the same student
//   (hard cap, so finance has to escalate rather than keep accepting
//   notes silently). Branch is pulled from the student record;
//   BRANCH_ADMIN / FRONTDESK must match it.
//
// Teachers and students always get 403 — this is a finance-office
// artefact they shouldn't see.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, type ClassPortalRole } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../_cors'

const MAX_BYTES = 100 * 1024 * 1024 // 100 MB
const MAX_PER_STUDENT = 5
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf']
const STAFF_ROLES: ClassPortalRole[] = ['ADMIN', 'BRANCH_ADMIN', 'FRONTDESK']

function isStaffRole(role: ClassPortalRole): boolean {
  return STAFF_ROLES.includes(role)
}

function mimeAllowed(mime: string): boolean {
  const m = (mime || '').toLowerCase()
  return ALLOWED_MIME_PREFIXES.some(p => m.startsWith(p))
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (!isStaffRole(auth.role)) {
      return withCors(NextResponse.json({ error: 'Promissory notes are restricted to admins and front desk.' }, { status: 403 }), origin)
    }
    const url = new URL(req.url)
    const studentId = (url.searchParams.get('studentId') ?? '').trim()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}
    if (studentId) where.studentId = studentId
    // Branch admins + front desk only see their own branch. Main admin
    // (ADMIN) sees everything (`branch` left undefined).
    if (auth.role !== 'ADMIN' && auth.branch) where.branch = auth.branch

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma.classPortalPromissoryNote as any).findMany({
      where,
      select: {
        id: true,
        studentId: true,
        studentEmail: true,
        studentName: true,
        branch: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        notes: true,
        uploadedBy: true,
        createdAt: true,
      },
      orderBy: [{ studentName: 'asc' }, { createdAt: 'desc' }],
    })

    return withCors(NextResponse.json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notes: rows.map((r: any) => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      })),
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[promissory-notes.GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (!isStaffRole(auth.role)) {
      return withCors(NextResponse.json({ error: 'Only admins and front desk can upload promissory notes.' }, { status: 403 }), origin)
    }

    const form = await req.formData()
    const f = form.get('file')
    const studentId = String(form.get('studentId') ?? '').trim()
    const notes = String(form.get('notes') ?? '').trim() || null

    if (!studentId) {
      return withCors(NextResponse.json({ error: 'studentId is required.' }, { status: 400 }), origin)
    }
    if (!f || !(f instanceof File)) {
      return withCors(NextResponse.json({ error: 'Missing file field.' }, { status: 400 }), origin)
    }
    if (f.size > MAX_BYTES) {
      return withCors(NextResponse.json({
        error: `File too large (${(f.size / 1024 / 1024).toFixed(1)}MB > 100MB). Scan at a lower resolution and try again.`,
      }, { status: 413 }), origin)
    }
    const fileType = f.type || 'application/octet-stream'
    if (!mimeAllowed(fileType)) {
      return withCors(NextResponse.json({
        error: `Promissory notes must be a PDF or an image (got ${fileType}).`,
      }, { status: 415 }), origin)
    }

    // Resolve the student + enforce branch scope.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const student = await (prisma.classPortalUser as any).findUnique({
      where: { id: studentId },
      select: { id: true, email: true, firstName: true, lastName: true, branch: true, role: true },
    })
    if (!student || student.role !== 'STUDENT') {
      return withCors(NextResponse.json({ error: 'Student not found.' }, { status: 404 }), origin)
    }
    if (auth.role !== 'ADMIN' && auth.branch && student.branch !== auth.branch) {
      return withCors(NextResponse.json({ error: 'Student is in another branch.' }, { status: 403 }), origin)
    }

    // Hard cap of 5 notes per student.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingCount = await (prisma.classPortalPromissoryNote as any).count({ where: { studentId } })
    if (existingCount >= MAX_PER_STUDENT) {
      return withCors(NextResponse.json({
        error: `Already ${existingCount} notes on file for this student (max ${MAX_PER_STUDENT}). Delete one before uploading another.`,
      }, { status: 409 }), origin)
    }

    const studentName = [student.firstName, student.lastName].filter(Boolean).join(' ').trim() || student.email
    const buf = Buffer.from(await f.arrayBuffer())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalPromissoryNote as any).create({
      data: {
        studentId: student.id,
        studentEmail: student.email,
        studentName,
        branch: student.branch,
        fileName: f.name,
        fileType,
        fileSize: f.size,
        fileData: buf,
        notes,
        uploadedBy: auth.email,
      },
      select: {
        id: true, studentId: true, studentEmail: true, studentName: true,
        branch: true, fileName: true, fileType: true, fileSize: true,
        notes: true, uploadedBy: true, createdAt: true,
      },
    })

    return withCors(NextResponse.json({
      note: {
        ...row,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      },
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[promissory-notes.POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
