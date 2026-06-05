// GET /api/public/class-portal/vouchers  — admin only; lists every tuition
//                                           discount voucher for management.
// PUT /api/public/class-portal/vouchers  — admin only; replaces the full set.
//
// Vouchers are global (not per-branch). Parents validate a code against the
// /vouchers/validate endpoint from the Pay portal.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../_cors'

interface VoucherRow {
  id: string
  code: string
  discountPercent: number
  validUntil: string // ISO
  enabled: boolean
  updatedAt: string | null
  updatedBy: string | null
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRow(r: any): VoucherRow {
  return {
    id: r.id,
    code: r.code,
    discountPercent: r.discountPercent,
    validUntil: r.validUntil instanceof Date ? r.validUntil.toISOString() : String(r.validUntil),
    enabled: r.enabled,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : (r.updatedAt ?? null),
    updatedBy: r.updatedBy ?? null,
  }
}

/** Parse an admin-entered validUntil (YYYY-MM-DD or ISO) into a Date that
 *  represents the END of that calendar day in PH time (UTC+8) so a code
 *  marked "valid until June 12" still works all day on June 12 locally. */
function endOfDay(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const datePart = raw.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
  }
  // 23:59:59.999 PH time == 15:59:59.999Z of the same day.
  const d = new Date(`${datePart}T15:59:59.999Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    await requireAuth(req, ['ADMIN', 'BRANCH_ADMIN'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).classPortalVoucher.findMany({ orderBy: { createdAt: 'desc' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vouchers = rows.map((r: any) => toRow(r))
    return withCors(NextResponse.json({ vouchers }), origin)
  } catch (e) { return jsonError(origin, e) }
}

export async function PUT(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req, ['ADMIN', 'BRANCH_ADMIN'])
    const body = await req.json() as { vouchers: Array<Partial<VoucherRow>> }
    if (!Array.isArray(body.vouchers)) {
      return withCors(NextResponse.json({ error: 'vouchers must be an array.' }, { status: 400 }), origin)
    }

    const seen = new Set<string>()
    const valid: Array<{ code: string; discountPercent: number; validUntil: Date; enabled: boolean }> = []
    for (const v of body.vouchers) {
      const code = typeof v.code === 'string' ? v.code.trim().toUpperCase().slice(0, 40) : ''
      if (!code) continue
      if (seen.has(code)) {
        return withCors(NextResponse.json({ error: `Duplicate voucher code: ${code}` }, { status: 400 }), origin)
      }
      const validUntil = endOfDay(v.validUntil)
      if (!validUntil) {
        return withCors(NextResponse.json({ error: `Voucher ${code} needs a valid "Valid until" date.` }, { status: 400 }), origin)
      }
      const discountPercent = Math.max(0, Math.min(100, Math.round(Number(v.discountPercent ?? 0))))
      seen.add(code)
      valid.push({ code, discountPercent, validUntil, enabled: v.enabled !== false })
    }

    // Replace the full set in one transaction so the admin UI is the source
    // of truth — codes removed in the UI disappear from the DB.
    await prisma.$transaction([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).classPortalVoucher.deleteMany({}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...valid.map(v => (prisma as any).classPortalVoucher.create({
        data: { ...v, updatedBy: auth.email },
      })),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).classPortalVoucher.findMany({ orderBy: { createdAt: 'desc' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vouchers = rows.map((r: any) => toRow(r))
    return withCors(NextResponse.json({ vouchers }), origin)
  } catch (e) { return jsonError(origin, e) }
}
