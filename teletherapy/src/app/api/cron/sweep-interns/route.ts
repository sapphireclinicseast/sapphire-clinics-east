/**
 * Daily sweep: disable intern portal accounts whose clinical rotation has
 * lapsed by more than ROTATION_GRACE_DAYS (15). Accounts a human re-enabled
 * (internAccessOverride) are skipped. Triggered by a system cron with the
 * x-cron-secret header, or manually by an admin session.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sweepExpiredInterns } from '@/lib/intern-access'

// Manual/cron trigger for the sweep. The sweep also runs opportunistically on
// normal Intern-Supervision page loads (throttled), so this endpoint is a
// convenience, not the only path.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const headerSecret = req.headers.get('x-cron-secret')
  let authorized = !!secret && headerSecret === secret
  if (!authorized) {
    const session = await auth()
    authorized = session?.user?.role === 'ADMIN'
  }
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const disabled = await sweepExpiredInterns()
  return NextResponse.json({ disabled })
}
