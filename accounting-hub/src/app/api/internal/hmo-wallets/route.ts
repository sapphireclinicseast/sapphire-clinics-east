// GET /api/internal/hmo-wallets — the HMO providers, for the Ops Hub LOA form.
//
// The HMO digital wallets under Point of Sale → Digital Wallet → HMO are the
// clinic's real list of providers: they are the things that carry a receivable
// balance and get a Statement of Account. The LOA form used to keep its own
// list, which meant two places to add a provider and two lists to drift apart.
// This is the one the Ops Hub now syncs from.
//
// Auth: EXTERNAL_API_KEY bearer, the same key the other cross-hub reads use.
// Names only — no balances, no patients, nothing clinical.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY || ''

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!API_KEY || auth !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const wallets = await prisma.digitalWallet.findMany({
    where: { walletType: 'HMO', isActive: true },
    select: { patientName: true, branch: true },
    orderBy: { patientName: 'asc' },
  })

  // One provider can hold a wallet per branch (East and Greenhills each carry
  // their own INTELLICARE receivable), so the same name arrives more than once.
  // The LOA form wants the provider, not the receivable, so fold them.
  const names = [...new Set(
    wallets
      .map(w => (w.patientName ?? '').trim())
      .filter(Boolean)
      // A deleted-then-recreated wallet can leave a stray blank or placeholder;
      // don't offer those as choices on a patient-facing form.
      .filter(n => n.toLowerCase() !== 'n/a' && n !== '-'),
  )].sort((a, b) => a.localeCompare(b))

  return NextResponse.json({ hmos: names, count: names.length })
}
