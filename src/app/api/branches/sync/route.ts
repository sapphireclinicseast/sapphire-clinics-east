/**
 * Branches Sync — Pull the Branches Registry from HR Platform (admin button).
 *
 * The sync itself lives in @/lib/sync-branches so the scheduled job at
 * /api/branches/sync/cron runs exactly the same code.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { syncBranchesFromHr } from '@/lib/sync-branches'

export async function POST() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const result = await syncBranchesFromHr()
  if (!result.ok) {
    const status = result.error?.includes('not configured') ? 500 : 502
    return NextResponse.json({ error: result.error }, { status })
  }

  const { ok: _ok, error: _error, ...body } = result
  return NextResponse.json(body)
}
