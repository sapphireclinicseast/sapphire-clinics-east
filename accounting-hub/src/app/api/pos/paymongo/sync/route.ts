import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { paymongoConfigured } from '@/lib/paymongo'
import { syncPendingCheckouts } from '@/lib/paymongo-settle'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

// POST → ask PayMongo whether any PENDING checkouts were paid, and settle them.
// A safety net so a missed/unregistered webhook doesn't leave orders stuck UNPAID.
export async function POST() {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  if (!paymongoConfigured()) return NextResponse.json({ error: 'PayMongo is not configured' }, { status: 400 })
  try {
    const res = await syncPendingCheckouts()
    return NextResponse.json({ ok: true, ...res })
  } catch (e) {
    console.error('PayMongo sync error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Sync failed' }, { status: 500 })
  }
}
