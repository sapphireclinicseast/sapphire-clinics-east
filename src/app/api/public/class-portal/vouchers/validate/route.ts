// POST /api/public/class-portal/vouchers/validate  — any authenticated user.
//
// A parent on /pay types a voucher code; the portal posts it here. We look
// the code up (case-insensitive), confirm it's enabled and still within its
// validUntil window (server clock is authoritative), and return the discount
// percent. Codes are never listed to non-admins — only validated one at a time.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'

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

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    await requireAuth(req)
    const body = await req.json().catch(() => ({})) as { code?: string }
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
    if (!code) {
      return withCors(NextResponse.json({ valid: false, reason: 'Enter a voucher code.' }), origin)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).classPortalVoucher.findUnique({ where: { code } })
    if (!row || !row.enabled) {
      return withCors(NextResponse.json({ valid: false, reason: 'That voucher code is not valid.' }), origin)
    }

    const validUntil = row.validUntil instanceof Date ? row.validUntil : new Date(row.validUntil)
    if (Date.now() > validUntil.getTime()) {
      return withCors(NextResponse.json({ valid: false, reason: 'This voucher has expired.' }), origin)
    }

    return withCors(NextResponse.json({
      valid: true,
      code: row.code,
      discountPercent: row.discountPercent,
      validUntil: validUntil.toISOString(),
    }), origin)
  } catch (e) { return jsonError(origin, e) }
}
