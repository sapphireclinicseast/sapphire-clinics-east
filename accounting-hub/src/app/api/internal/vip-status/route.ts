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

  let body: { patientIds?: unknown }
  try { body = await req.json() } catch { body = {} }

  const patientIds = Array.isArray(body.patientIds)
    ? body.patientIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : []

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
