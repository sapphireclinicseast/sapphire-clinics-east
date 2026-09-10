/**
 * Staff Sync — the Staff module's "Sync" button.
 *
 * The work itself lives in @/lib/staff-sync so the nightly cron
 * (api/staff/sync/cron) runs the identical code path. All this route adds is
 * the human check: who is allowed to press the button.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { syncStaffFromHr, StaffSyncError } from '@/lib/staff-sync'

export async function POST() {
  console.log('[staff-sync] === SYNC CALLED ===')

  const session = await auth()
  if (!session) {
    console.log('[staff-sync] No session - unauthorized')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as { role?: string }).role ?? ''
  console.log('[staff-sync] User role:', role)
  if (!['ADMIN', 'MARKETING_ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN', 'AHEA_FRONT_DESK', 'AHGH_FRONT_DESK'].includes(role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    return NextResponse.json(await syncStaffFromHr())
  } catch (err) {
    if (err instanceof StaffSyncError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[staff-sync]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
