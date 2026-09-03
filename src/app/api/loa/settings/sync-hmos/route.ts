// POST /api/loa/settings/sync-hmos — pull the HMO list from the Accounting Hub.
//
// The list shown on the LOA form mirrors the HMO digital wallets under
// Point of Sale → Digital Wallet → HMO. This is the manual "Sync now" button;
// the same function runs on a schedule from /api/loa/settings/sync-hmos/cron.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { syncHmoProvidersFromAccounting } from '@/lib/sync-hmo-providers'

const EDIT_ROLES = ['ADMIN', 'MARKETING_ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN']

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!EDIT_ROLES.includes(role))
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const result = await syncHmoProvidersFromAccounting()
  if (!result.ok) {
    // 502 rather than 500: the failure is the other hub, and the message says so.
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json(result)
}
