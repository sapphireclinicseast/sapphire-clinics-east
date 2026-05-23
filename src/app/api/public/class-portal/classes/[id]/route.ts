// GET    /api/public/class-portal/classes/[id]
//   Single-class fetch. Same scoping as the list endpoint — teacher must
//   own it, student must be enrolled, branch admin must be in branch,
//   admin sees anything, front desk forbidden.
//
// PATCH  /api/public/class-portal/classes/[id]
//   Update one or more class fields. Teacher of record can patch any
//   field. Admins / branch admins (in scope) can patch any field.
//
// DELETE /api/public/class-portal/classes/[id]
//   Teacher of record can delete their own class. Admin / branch admin
//   (in scope) can delete anyone's class.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'

const ALLOWED_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(r: any, teacherName?: string | null) {
  return {
    id: r.id, branch: r.branch, level: r.level, name: r.name, section: r.section,
    teacherId: r.teacherId,
    // Server-resolved teacher name — see the list endpoint comment for
    // why this needs to live on the row instead of being resolved by
    // the client.
    teacherName: teacherName ?? null,
    studentIds: r.studentIds ?? [],
    scheduleDays: r.scheduleDays ?? [],
    scheduleStartTime: r.scheduleStartTime, scheduleEndTime: r.scheduleEndTime,
    hasPhoto: !!r.photoFileName,
    photoFileName: r.photoFileName, photoFileType: r.photoFileType, photoFileSize: r.photoFileSize,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

/** Resolve the teacher display name for a single class row.
 *  1) Explicit teacherId on the class → fetch user row.
 *  2) No teacherId → look up Assignments matrix (branch × level → teacher).
 *  Returns null if no teacher can be resolved (truly unassigned class). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveTeacherName(row: any): Promise<string | null> {
  let tid = row.teacherId as string | null
  if (!tid) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = await (prisma.classPortalTeacherAssignment as any).findFirst({
      where: { branch: row.branch, level: row.level },
      select: { teacherId: true },
    })
    tid = a?.teacherId ?? null
  }
  if (!tid) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = await (prisma.classPortalUser as any).findUnique({
    where: { id: tid },
    select: { firstName: true, lastName: true, email: true },
  })
  if (!u) return null
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { id } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalClass as any).findUnique({
      where: { id },
      select: {
        id: true, branch: true, level: true, name: true, section: true,
        teacherId: true, studentIds: true,
        scheduleDays: true, scheduleStartTime: true, scheduleEndTime: true,
        photoFileName: true, photoFileType: true, photoFileSize: true,
        createdAt: true, updatedAt: true,
      },
    })
    if (!row) return withCors(NextResponse.json({ error: 'Class not found.' }, { status: 404 }), origin)
    if (!canSee(auth, row)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    const teacherName = await resolveTeacherName(row)
    return withCors(NextResponse.json({ class: serialize(row, teacherName) }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[classes/[id].GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { id } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalClass as any).findUnique({ where: { id } })
    if (!row) return withCors(NextResponse.json({ error: 'Class not found.' }, { status: 404 }), origin)
    if (!canEdit(auth, row)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)

    const body = await req.json() as {
      name?: string
      section?: string | null
      level?: string
      studentIds?: string[]
      scheduleDays?: string[]
      scheduleStartTime?: string | null
      scheduleEndTime?: string | null
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { updatedAt: new Date() }
    if (body.name !== undefined) data.name = body.name.trim()
    if (body.section !== undefined) data.section = body.section?.trim() || null
    if (body.level !== undefined) data.level = body.level
    if (Array.isArray(body.studentIds)) data.studentIds = body.studentIds
    if (Array.isArray(body.scheduleDays)) data.scheduleDays = body.scheduleDays.filter(d => ALLOWED_DAYS.includes(d))
    if (body.scheduleStartTime !== undefined) data.scheduleStartTime = body.scheduleStartTime || null
    if (body.scheduleEndTime !== undefined) data.scheduleEndTime = body.scheduleEndTime || null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma.classPortalClass as any).update({
      where: { id },
      data,
      select: {
        id: true, branch: true, level: true, name: true, section: true,
        teacherId: true, studentIds: true,
        scheduleDays: true, scheduleStartTime: true, scheduleEndTime: true,
        photoFileName: true, photoFileType: true, photoFileSize: true,
        createdAt: true, updatedAt: true,
      },
    })
    const teacherName = await resolveTeacherName(updated)
    return withCors(NextResponse.json({ class: serialize(updated, teacherName) }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[classes/[id].PATCH]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { id } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalClass as any).findUnique({ where: { id } })
    if (!row) return withCors(NextResponse.json({ error: 'Class not found.' }, { status: 404 }), origin)
    if (!canEdit(auth, row)) return withCors(NextResponse.json({ error: 'Forbidden.' }, { status: 403 }), origin)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalClass as any).delete({ where: { id } })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[classes/[id].DELETE]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
