// GET /api/internal/referrers?type=DOCTOR
//
// The referrer names the Operations Hub offers as a dropdown — today on the
// public patient registration form, so a parent can pick the doctor who sent
// them instead of the desk retyping it later.
//
// Live on purpose: a doctor added under Referral → Referrers → Doctors here
// shows up in that dropdown on the next page load, with nothing to sync.
//
// Auth: Authorization: Bearer EXTERNAL_API_KEY — the same shared inter-hub key
// as /api/internal/vip-status.
//
// Returns NAMES ONLY. The referrer record also carries affiliation,
// specialization and branch scope; none of that is needed to fill in a
// dropdown, and this feeds a page anyone can open. Sending the minimum keeps
// the clinic's referral relationships from being enumerable through it.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const TYPES = new Set(['DOCTOR', 'LAW_FIRM', 'PARTNER_SCHOOL'])

function verifyKey(req: NextRequest): boolean {
  const key = process.env.EXTERNAL_API_KEY
  if (!key) return false
  return req.headers.get('authorization') === `Bearer ${key}`
}

export async function GET(req: NextRequest) {
  if (!verifyKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const raw = req.nextUrl.searchParams.get('type') ?? 'DOCTOR'
  const type = TYPES.has(raw) ? raw : 'DOCTOR'

  const rows = await prisma.referrer.findMany({
    where: { isActive: true, type },
    select: { name: true },
    orderBy: { name: 'asc' },
  })

  // De-duplicated: the same doctor can be recorded twice with different
  // affiliations, and a dropdown showing one name twice looks broken.
  const names = [...new Set(rows.map(r => r.name.trim()).filter(Boolean))]
  return NextResponse.json({ ok: true, type, names })
}
