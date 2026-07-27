import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listPayouts, parsePayout, paymongoConfigured, isPaymongoAccount } from '@/lib/paymongo'

import { PAYMONGO_READ_ROLES as READ_ROLES, canReadPaymongoAccount } from '@/lib/paymongo-access'

/**
 * GET ?account=AHEA — payouts (bank settlements) for one PayMongo account, read live.
 * Used for bank reconciliation: `settled` means the money has landed in the bank account.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const account = String(new URL(req.url).searchParams.get('account') || '').toUpperCase()
  if (!isPaymongoAccount(account)) return NextResponse.json({ error: 'Invalid account' }, { status: 400 })
  // Front desk only sees their own branch's account.
  if (!canReadPaymongoAccount(session.user.role as string, account)) {
    return NextResponse.json({ error: 'Not your branch' }, { status: 403 })
  }
  if (!paymongoConfigured(account)) {
    return NextResponse.json({ account, configured: false, payouts: [] })
  }
  try {
    const raw = await listPayouts(account, { limit: 50 })
    const payouts = raw.map(r => {
      const p = parsePayout(r)
      return {
        payoutId: p.payoutId, net: p.netPhp, fee: p.feePhp,
        status: p.status, settled: p.settled,
        paidAt: p.paidAt ? p.paidAt.toISOString() : null,
      }
    }).sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''))
    return NextResponse.json({ account, configured: true, payouts })
  } catch (e) {
    console.error('PayMongo payouts error:', e)
    return NextResponse.json({ account, configured: true, payouts: [], error: e instanceof Error ? e.message : 'Failed to load payouts' })
  }
}
