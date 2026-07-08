/**
 * Games — has this email already claimed a prize?
 *
 * GET /api/public/games/claim-status?email=...
 *
 * Used after registration to lock a returning player out of a second prize.
 * Proxies to HR. Fails "not claimed" if HR is unreachable (so a blip doesn't
 * block play — the /win route still enforces one-per-email server-side).
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HR_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get('email') || '').trim()
  if (!email) return NextResponse.json({ ok: true, claimed: false })
  try {
    const res = await fetch(`${HR_URL}/marketing-vouchers/by-email?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${HR_KEY}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    })
    const data = await res.json().catch(() => null)
    if (data?.ok && data.voucher) {
      return NextResponse.json({ ok: true, claimed: true, voucher: data.voucher })
    }
  } catch (e: any) {
    console.error('[games/claim-status] HR check failed:', e?.message || e)
  }
  return NextResponse.json({ ok: true, claimed: false })
}
