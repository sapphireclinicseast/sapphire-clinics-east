// GET /api/public/class-portal/audit?limit=200&email=...&kind=...&since=ISO8601
//
// Main-admin-only view of the enrollment audit log. Used to trace cases
// like "the parent says they uploaded but there's no record" by showing
// every server-visible event tied to a given email or kind.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../_cors'

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 1000

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (auth.role !== 'ADMIN' && auth.role !== 'BRANCH_ADMIN') {
      return withCors(NextResponse.json({ error: 'Only the main admin or branch admin can view the audit log.' }, { status: 403 }), origin)
    }
    const url = new URL(req.url)
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)))
    const emailFilter = url.searchParams.get('email')?.trim().toLowerCase() || null
    const kindFilter = url.searchParams.get('kind')?.trim() || null
    const sinceParam = url.searchParams.get('since')?.trim() || null
    const since = sinceParam ? new Date(sinceParam) : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}
    if (emailFilter) where.email = { contains: emailFilter }
    if (kindFilter) where.kind = kindFilter
    if (since && !isNaN(since.getTime())) where.createdAt = { gte: since }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).classPortalEnrollmentAudit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return withCors(NextResponse.json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      events: rows.map((r: any) => ({
        id: r.id,
        kind: r.kind,
        email: r.email,
        studentId: r.studentId,
        docKey: r.docKey,
        outcome: r.outcome,
        error: r.error,
        ip: r.ip,
        userAgent: r.userAgent,
        metadata: r.metadata,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      })),
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[audit GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
