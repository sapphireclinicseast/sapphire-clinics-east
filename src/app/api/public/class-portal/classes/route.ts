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
function serialize(r: any, teacherName?: string | null) {
  return {
    id: r.id,
    branch: r.branch,
    level: r.level,
    name: r.name,
    section: r.section,
    teacherId: r.teacherId,
    // Server-resolved teacher name. The class-portal user list endpoint
    // scopes results to STUDENT rows for non-admin callers, so a student
    // viewer's local teachers cache is always empty and the client-side
    // resolver falls through to "—". Returning the name here lets every
    // viewer render it without leaking the rest of the teacher list.
    teacherName: teacherName ?? null,
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

/**
 * Build a teacherId → "First Last" / email map for a set of classes.
 * Uses the explicit teacherId when present; falls back to the
 * branch × level entry in the Assignments matrix (set by the main admin
 * under /admin → Assignments) when the class has no teacher pinned.
 * Performs a single batched query each for users + assignments, so the
 * list endpoint stays O(1) DB roundtrips regardless of how many classes
 * the caller can see.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveTeacherNames(rows: any[]): Promise<Map<string, string>> {
  // Step 1: gather the explicit teacherIds.
  const explicitIds = new Set<string>()
  for (const r of rows) if (r.teacherId) explicitIds.add(r.teacherId)

  // Step 2: for rows without a teacherId, look up the Assignments
  // matrix entry by branch × level and gather those teacherIds too.
  const needAssignment = rows.filter(r => !r.teacherId)
  let assignmentRows: Array<{ branch: string; level: string; teacherId: string }> = []
  if (needAssignment.length > 0) {
    const branchLevels = new Set(needAssignment.map(r => `${r.branch}|${r.level}`))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = await (prisma.classPortalTeacherAssignment as any).findMany({
      select: { branch: true, level: true, teacherId: true },
    })
    assignmentRows = (all as Array<{ branch: string; level: string; teacherId: string }>).filter(a => branchLevels.has(`${a.branch}|${a.level}`))
    for (const a of assignmentRows) explicitIds.add(a.teacherId)
  }

  // Step 3: fetch all involved teacher users in one go.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users = explicitIds.size > 0
    ? await (prisma.classPortalUser as any).findMany({
        where: { id: { in: Array.from(explicitIds) } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : []

  // Step 4: build the row.id → name map.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userById = new Map<string, { firstName?: string; lastName?: string; email: string }>(
    (users as Array<{ id: string; firstName?: string; lastName?: string; email: string }>).map(u => [u.id, u]),
  )
  const out = new Map<string, string>()
  for (const r of rows) {
    let tid = r.teacherId as string | null
    if (!tid) {
      const a = assignmentRows.find(x => x.branch === r.branch && x.level === r.level)
      tid = a?.teacherId ?? null
    }
    if (!tid) continue
    const u = userById.get(tid)
    if (!u) continue
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
    out.set(r.id, name)
  }
  return out
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
    const nameByClassId = await resolveTeacherNames(rows)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return withCors(NextResponse.json({ classes: rows.map((r: any) => serialize(r, nameByClassId.get(r.id))) }), origin)
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
    const nameMap = await resolveTeacherNames([row])
    return withCors(NextResponse.json({ class: serialize(row, nameMap.get(row.id)) }), origin)
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
