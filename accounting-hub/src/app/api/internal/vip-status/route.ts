// POST /api/internal/vip-status
// Body: { patientIds: string[] }
//
// Called by the Operations Hub front-desk dashboard to check which patients
// hold an active VIP Digital Wallet card (POS > Services > Digital Wallet >
// VIP), one of the two qualifying conditions for the free Aura the Alpaca
// plush-toy perk (the other — 100 confirmed sessions — is computed entirely
// within Operations Hub's own Schedule data).
//
// POST with a JSON body, not GET with a query string — a full branch's
// candidate-patient list (thousands of ids) blew past the URL length limit
// as a query string and the whole check silently 414'd on every call.
//
// Auth: Authorization: Bearer EXTERNAL_API_KEY (shared inter-hub key, same
// pattern as /api/internal/pos/portal-downpayment).
//
// Returns: { vipPatientIds: string[] } — the subset of the requested ids
// that currently hold an active (isActive=true) VIP wallet. Ids with no
// wallet at all, or only an inactive/soft-deleted one, are simply absent
// from the result rather than erroring — "not VIP" is a valid outcome.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function verifyKey(req: NextRequest): boolean {
  const key = process.env.EXTERNAL_API_KEY
  if (!key) return false
  return req.headers.get('authorization') === `Bearer ${key}`
}

export async function POST(req: NextRequest) {
  if (!verifyKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { patientIds?: unknown; includeAllActive?: unknown }
  try { body = await req.json() } catch { body = {} }

  const patientIds = Array.isArray(body.patientIds)
    ? body.patientIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : []

  // ── includeAllActive ─────────────────────────────────────────────
  // Every active VIP wallet with the name on it, rather than the subset
  // matching a list of ids the caller already holds.
  //
  // Needed because the two hubs' patient ids drift. A patient re-registered in
  // Operations Hub gets a new id there while the wallet here keeps the old one,
  // and an id-only match then reports "not VIP" — indistinguishable from having
  // no wallet at all. 233 of the 1,264 active wallets are in that state; one of
  // them is a VIP, so a real VIP patient could never appear on the front-desk
  // plush-toy list. The name lets the caller recover the match and, failing
  // that, say out loud that a wallet could not be placed.
  //
  // Small by nature — a dozen rows — so there is no paging here.
  if (body.includeAllActive === true) {
    const all = await prisma.digitalWallet.findMany({
      where: { walletType: 'VIP', isActive: true },
      select: { patientId: true, patientName: true },
    })
    return NextResponse.json({
      // Still answers the id question when ids were also supplied, so one
      // request can serve both callers.
      vipPatientIds: patientIds.length
        ? [...new Set(all.filter(w => patientIds.includes(w.patientId)).map(w => w.patientId))]
        : [],
      activeVipWallets: all,
    })
  }

  if (patientIds.length === 0) {
    return NextResponse.json({ error: 'patientIds (non-empty array) is required' }, { status: 400 })
  }

  const wallets = await prisma.digitalWallet.findMany({
    where: {
      patientId:  { in: patientIds },
      walletType: 'VIP',
      isActive:   true,
    },
    select: { patientId: true },
  })

  const vipPatientIds = [...new Set(wallets.map(w => w.patientId))]
  return NextResponse.json({ vipPatientIds })
}
