// GET  /api/public/class-portal/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD&branch=EAST|GREENHILLS
//      — any authenticated role; returns events in [from, to] for the
//        caller's branch. STUDENT/BRANCH_ADMIN/FRONTDESK auto-scope to
//        their own branch; ADMIN/TEACHER must pass ?branch= (defaults
//        to EAST when omitted).
// POST /api/public/class-portal/calendar/events — admin/teacher only.
//      Body must include `branch`.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'

type Branch = 'EAST' | 'GREENHILLS'

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

function parseDate(s: string | null, fallback: Date): Date {
  if (!s) return fallback
  const d = new Date(s + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? fallback : d
}

function isBranch(s: unknown): s is Branch {
  return s === 'EAST' || s === 'GREENHILLS'
}

// Resolve which branch the caller is viewing. Returns null when a
// STUDENT has no branch set (defensive — caller surfaces empty events).
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
  // ADMIN / TEACHER → param-driven, default EAST.
  return isBranch(paramBranch) ? paramBranch : 'EAST'
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const url = new URL(req.url)
    const today = new Date()
    const defaultFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 6, 1))
    const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 7, 0))
    const from = parseDate(url.searchParams.get('from'), defaultFrom)
    const to = parseDate(url.searchParams.get('to'), defaultTo)
    const branch = await resolveReadBranch(auth, url.searchParams.get('branch'))
    if (!branch) {
      return withCors(NextResponse.json({ events: [], branch: null }), origin)
    }

    const events = await prisma.classPortalCalendarEvent.findMany({
      where: { branch, date: { gte: from, lte: to } },
      orderBy: [{ date: 'asc' }],
    })
    return withCors(NextResponse.json({
      branch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      events: events.map((e: any) => ({
        id: e.id,
        branch: e.branch,
        date: e.date.toISOString().slice(0, 10),
        endDate: e.endDate ? e.endDate.toISOString().slice(0, 10) : null,
        title: e.title,
        description: e.description,
        type: e.type,
        createdBy: e.createdBy,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
    }), origin)
  } catch (e) { return jsonError(origin, e) }
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req, ['ADMIN', 'TEACHER'])
    const body = await req.json() as {
      branch?: string
      date: string
      endDate?: string | null
      title: string
      description?: string | null
      type?: 'CLASS_CANCELLED' | 'HOLIDAY' | 'FIELD_TRIP' | 'IEP_REVIEW' | 'EVENT'
    }
    if (!isBranch(body.branch)) {
      return withCors(NextResponse.json({ error: 'branch is required (EAST or GREENHILLS).' }, { status: 400 }), origin)
    }
    if (!body.date || !body.title?.trim()) {
      return withCors(NextResponse.json({ error: 'date and title are required.' }, { status: 400 }), origin)
    }
    const created = await prisma.classPortalCalendarEvent.create({
      data: {
        branch: body.branch,
        date: new Date(body.date + 'T00:00:00Z'),
        endDate: body.endDate ? new Date(body.endDate + 'T00:00:00Z') : null,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: (body.type ?? 'EVENT') as any,
        createdBy: auth.email,
      },
    })
    return withCors(NextResponse.json({
      event: {
        id: created.id,
        branch: created.branch,
        date: created.date.toISOString().slice(0, 10),
        endDate: created.endDate ? created.endDate.toISOString().slice(0, 10) : null,
        title: created.title,
        description: created.description,
        type: created.type,
        createdBy: created.createdBy,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    }), origin)
  } catch (e) { return jsonError(origin, e) }
}
