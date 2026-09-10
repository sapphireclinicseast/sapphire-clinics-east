// POST /api/staff/sync/cron — pull the HR roster nightly.
//
// The sync had one trigger: a button in the Staff module. Nobody presses a
// button they have no reason to think about, so the roster drifted from HR
// until something went visibly wrong. Caitlynn Billedo was deactivated in HR
// and still on the Decking board nine days later, because the last sync had
// run on 2026-08-31.
//
// Idempotent: it upserts everyone in the feed and deactivates everyone absent
// from it, so running twice in a night changes nothing the first run did not.
//
// Auth: x-cron-secret, same as the other crons here.

import { NextResponse } from 'next/server'
import { syncStaffFromHr, StaffSyncError } from '@/lib/staff-sync'

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured on server.' }, { status: 503 })
  }
  if ((req.headers.get('x-cron-secret') ?? '') !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncStaffFromHr()
    console.log(
      `[staff-sync-cron] ${result.created} created, ${result.updated} updated, ` +
      `${result.deactivated} deactivated, ${result.total} from HR, ${result.errors.length} errors`,
    )
    // errors[] is reported, not swallowed: the partial-feed guard refuses to
    // deactivate anyone and says so there, and a nightly job nobody watches is
    // exactly where that notice would otherwise be lost.
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const status = err instanceof StaffSyncError ? err.status : 500
    console.error('[staff-sync-cron]', err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status })
  }
}

// Health check, mirroring the other crons: reports whether it *could* run
// without running it. A silently missing CRON_SECRET has cost this codebase
// months of unwritten data before.
export async function GET() {
  return NextResponse.json({ cronSecretConfigured: !!process.env.CRON_SECRET })
}
