// GET /api/public/class-portal/fees  — any auth; returns the fee schedule
//                                       for every branch (defaults when no
//                                       row exists yet).
// PUT /api/public/class-portal/fees  — admin only (main + branch); replaces
//                                       one or more branch schedules.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../_cors'

const ALL_BRANCHES = ['EAST', 'GREENHILLS'] as const
type ClassPortalBranch = (typeof ALL_BRANCHES)[number]

interface ExtraItem {
  label: string
  amountCentavos: number
  notes?: string
}
interface FeeRow {
  branch: ClassPortalBranch
  tuitionAnnualCentavos: number
  tuitionBiannualCentavos: number
  tuitionMonthlyCentavos: number
  miscAnnualCentavos: number
  miscBiannualCentavos: number
  miscMonthlyCentavos: number
  extraItems: ExtraItem[]
  updatedAt: string | null
  updatedBy: string | null
}

function defaultRow(branch: ClassPortalBranch): FeeRow {
  return {
    branch,
    tuitionAnnualCentavos: 0,
    tuitionBiannualCentavos: 0,
    tuitionMonthlyCentavos: 0,
    miscAnnualCentavos: 0,
    miscBiannualCentavos: 0,
    miscMonthlyCentavos: 0,
    extraItems: [],
    updatedAt: null,
    updatedBy: null,
  }
}

function sanitizeExtras(raw: unknown): ExtraItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object')
    .map(x => ({
      label: typeof x.label === 'string' ? x.label.trim().slice(0, 80) : '',
      amountCentavos: Number.isFinite(Number(x.amountCentavos)) ? Math.max(0, Math.round(Number(x.amountCentavos))) : 0,
      notes: typeof x.notes === 'string' ? x.notes.trim().slice(0, 200) : undefined,
    }))
    .filter(x => x.label)
}

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
    const rows = await prisma.classPortalFeeSchedule.findMany()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byBranch = new Map<string, any>(rows.map((r: any) => [r.branch, r]))
    const fees: FeeRow[] = ALL_BRANCHES.map(b => {
      const r = byBranch.get(b)
      if (!r) return defaultRow(b)
      return {
        branch: b,
        tuitionAnnualCentavos:   r.tuitionAnnualCentavos,
        tuitionBiannualCentavos: r.tuitionBiannualCentavos,
        tuitionMonthlyCentavos:  r.tuitionMonthlyCentavos,
        miscAnnualCentavos:      r.miscAnnualCentavos,
        miscBiannualCentavos:    r.miscBiannualCentavos,
        miscMonthlyCentavos:     r.miscMonthlyCentavos,
        extraItems: sanitizeExtras(r.extraItems),
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : (r.updatedAt ?? null),
        updatedBy: r.updatedBy ?? null,
      }
    })
    return withCors(NextResponse.json({ fees }), origin)
  } catch (e) { return jsonError(origin, e) }
}

export async function PUT(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req, ['ADMIN', 'BRANCH_ADMIN'])
    const body = await req.json() as { fees: Array<Partial<FeeRow>> }
    if (!Array.isArray(body.fees)) {
      return withCors(NextResponse.json({ error: 'fees must be an array.' }, { status: 400 }), origin)
    }
    const allowed = new Set(ALL_BRANCHES as readonly string[])
    const valid = body.fees
      .filter(x => typeof x.branch === 'string' && allowed.has(x.branch))
      .map(x => ({
        branch: x.branch as ClassPortalBranch,
        tuitionAnnualCentavos:   Math.max(0, Math.round(Number(x.tuitionAnnualCentavos   ?? 0))),
        tuitionBiannualCentavos: Math.max(0, Math.round(Number(x.tuitionBiannualCentavos ?? 0))),
        tuitionMonthlyCentavos:  Math.max(0, Math.round(Number(x.tuitionMonthlyCentavos  ?? 0))),
        miscAnnualCentavos:      Math.max(0, Math.round(Number(x.miscAnnualCentavos      ?? 0))),
        miscBiannualCentavos:    Math.max(0, Math.round(Number(x.miscBiannualCentavos    ?? 0))),
        miscMonthlyCentavos:     Math.max(0, Math.round(Number(x.miscMonthlyCentavos     ?? 0))),
        extraItems: sanitizeExtras(x.extraItems),
      }))

    // Branch admin may only touch their own branch.
    if (auth.role === 'BRANCH_ADMIN') {
      const offending = valid.find(v => v.branch !== auth.branch)
      if (offending) {
        return withCors(NextResponse.json({ error: 'Branch admins can only edit their own branch fees.' }, { status: 403 }), origin)
      }
    }

    await prisma.$transaction(
      valid.map(v =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma.classPortalFeeSchedule as any).upsert({
          where: { branch: v.branch },
          update: { ...v, extraItems: v.extraItems, updatedBy: auth.email },
          create: { ...v, extraItems: v.extraItems, updatedBy: auth.email },
        }),
      ),
    )
    // Return the canonical full list so caller can re-hydrate cache.
    const rows = await prisma.classPortalFeeSchedule.findMany()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byBranch = new Map<string, any>(rows.map((r: any) => [r.branch, r]))
    const fees: FeeRow[] = ALL_BRANCHES.map(b => {
      const r = byBranch.get(b)
      if (!r) return defaultRow(b)
      return {
        branch: b,
        tuitionAnnualCentavos:   r.tuitionAnnualCentavos,
        tuitionBiannualCentavos: r.tuitionBiannualCentavos,
        tuitionMonthlyCentavos:  r.tuitionMonthlyCentavos,
        miscAnnualCentavos:      r.miscAnnualCentavos,
        miscBiannualCentavos:    r.miscBiannualCentavos,
        miscMonthlyCentavos:     r.miscMonthlyCentavos,
        extraItems: sanitizeExtras(r.extraItems),
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : (r.updatedAt ?? null),
        updatedBy: r.updatedBy ?? null,
      }
    })
    return withCors(NextResponse.json({ fees }), origin)
  } catch (e) { return jsonError(origin, e) }
}
