// GET  /api/public/class-portal/classes
//   List classes visible to the caller:
//     TEACHER       → classes they own
//     STUDENT       → classes they're enrolled in
//     BRANCH_ADMIN  → classes in their branch
//     ADMIN         → everything
//     FRONTDESK     → forbidden
//
// POST /api/public/class-portal/classes
//   Teacher creates a new class for themselves. Admin / branch admin
//   can also create on behalf of any teacher in their scope.
//
// File bytes for the cover photo are written via a separate multipart
// PATCH on /api/public/class-portal/classes/[id]/photo so this route
// stays JSON.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

const ALLOWED_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(r: any) {
  return {
    id: r.id,
    branch: r.branch,
    level: r.level,
    name: r.name,
    section: r.section,
    teacherId: r.teacherId,
    studentIds: r.studentIds ?? [],
    scheduleDays: r.scheduleDays ?? [],
    scheduleStartTime: r.scheduleStartTime,
    scheduleEndTime: r.scheduleEndTime,
    hasPhoto: !!r.photoFileName,
    photoFileName: r.photoFileName,
    photoFileType: r.photoFileType,
    photoFileSize: r.photoFileSize,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (auth.role === 'FRONTDESK') {
      return withCors(NextResponse.json({ error: 'Front desk has no access to classes.' }, { status: 403 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}
    if (auth.role === 'TEACHER' && auth.userId) {
      where.teacherId = auth.userId
    } else if (auth.role === 'STUDENT' && auth.userId) {
      where.studentIds = { has: auth.userId }
    } else if (auth.role === 'BRANCH_ADMIN' && auth.branch) {
      where.branch = auth.branch
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma.classPortalClass as any).findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      // omit photoFileData from the list to keep the response small
      select: {
        id: true, branch: true, level: true, name: true, section: true,
        teacherId: true, studentIds: true,
        scheduleDays: true, scheduleStartTime: true, scheduleEndTime: true,
        photoFileName: true, photoFileType: true, photoFileSize: true,
        createdAt: true, updatedAt: true,
      },
    })
    return withCors(NextResponse.json({ classes: rows.map(serialize) }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[classes.GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (auth.role !== 'TEACHER' && auth.role !== 'ADMIN' && auth.role !== 'BRANCH_ADMIN') {
      return withCors(NextResponse.json({ error: 'Only teachers and admins can create classes.' }, { status: 403 }), origin)
    }
    const body = await req.json() as {
      branch?: 'EAST' | 'GREENHILLS'
      level?: string
      name?: string
      section?: string | null
      teacherId?: string
      studentIds?: string[]
      scheduleDays?: string[]
      scheduleStartTime?: string | null
      scheduleEndTime?: string | null
    }
    if (!body.branch || !body.level || !body.name?.trim()) {
      return withCors(NextResponse.json({ error: 'branch, level, and name are required.' }, { status: 400 }), origin)
    }
    // Teacher can only create for themselves; admins can create for any
    // teacher in their scope.
    const teacherId = auth.role === 'TEACHER' ? auth.userId! : (body.teacherId ?? auth.userId)
    if (!teacherId) {
      return withCors(NextResponse.json({ error: 'teacherId is required.' }, { status: 400 }), origin)
    }
    if (auth.role === 'BRANCH_ADMIN' && auth.branch && body.branch !== auth.branch) {
      return withCors(NextResponse.json({ error: 'Out of branch scope.' }, { status: 403 }), origin)
    }
    const days = (body.scheduleDays ?? []).filter(d => ALLOWED_DAYS.includes(d))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalClass as any).create({
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        branch: body.branch as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        level: body.level as any,
        name: body.name.trim(),
        section: body.section?.trim() || null,
        teacherId,
        studentIds: Array.isArray(body.studentIds) ? body.studentIds : [],
        scheduleDays: days,
        scheduleStartTime: body.scheduleStartTime || null,
        scheduleEndTime: body.scheduleEndTime || null,
      },
    })
    return withCors(NextResponse.json({ class: serialize(row) }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[classes.POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
