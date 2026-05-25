// GET /api/public/class-portal/levels  — any auth; returns enabled/disabled
//                                         flag for every grade level (defaults
//                                         to enabled for levels without a row).
// PUT /api/public/class-portal/levels  — admin only; replaces the status map.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../_cors'

const ALL_LEVELS = ['NURSERY', 'KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12'] as const
type ClassPortalLevel = (typeof ALL_LEVELS)[number]

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

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    await requireAuth(req)
    const rows = await prisma.classPortalLevelStatus.findMany()
    const byLevel = new Map<string, { enabled: boolean; updatedAt: Date; updatedBy: string | null }>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows.map((r: any) => [r.level, { enabled: r.enabled, updatedAt: r.updatedAt, updatedBy: r.updatedBy }]),
    )
    const levels = ALL_LEVELS.map(l => {
      const r = byLevel.get(l)
      return {
        level: l,
        enabled: r ? r.enabled : true, // default to enabled
        updatedAt: r ? r.updatedAt.toISOString() : null,
        updatedBy: r?.updatedBy ?? null,
      }
    })
    return withCors(NextResponse.json({ levels }), origin)
  } catch (e) { return jsonError(origin, e) }
}

export async function PUT(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req, ['ADMIN'])
    const body = await req.json() as { levels: Array<{ level: string; enabled: boolean }> }
    if (!Array.isArray(body.levels)) {
      return withCors(NextResponse.json({ error: 'levels must be an array.' }, { status: 400 }), origin)
    }
    const allowed = new Set(ALL_LEVELS as readonly string[])
    const valid = body.levels.filter(x => allowed.has(x.level))
    // Upsert each row in one transaction. Cheaper than delete-all + recreate
    // since the table is tiny (max 11 rows).
    await prisma.$transaction(
      valid.map(x =>
        prisma.classPortalLevelStatus.upsert({
          where: { level: x.level as ClassPortalLevel },
          update: { enabled: x.enabled, updatedBy: auth.email },
          create: { level: x.level as ClassPortalLevel, enabled: x.enabled, updatedBy: auth.email },
        }),
      ),
    )
    const rows = await prisma.classPortalLevelStatus.findMany()
    const byLevel = new Map<string, { enabled: boolean; updatedAt: Date; updatedBy: string | null }>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows.map((r: any) => [r.level, { enabled: r.enabled, updatedAt: r.updatedAt, updatedBy: r.updatedBy }]),
    )
    const levels = ALL_LEVELS.map(l => {
      const r = byLevel.get(l)
      return {
        level: l,
        enabled: r ? r.enabled : true,
        updatedAt: r ? r.updatedAt.toISOString() : null,
        updatedBy: r?.updatedBy ?? null,
      }
    })
    return withCors(NextResponse.json({ levels }), origin)
  } catch (e) { return jsonError(origin, e) }
}
