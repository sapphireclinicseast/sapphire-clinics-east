// POST /api/partner-institutions/sync/cron — pull the HR partner-institutions
// list nightly, same auth and idempotency story as staff/sync/cron: it
// upserts everyone in the feed and deactivates everyone absent from it, so
// running twice in a night changes nothing the first run did not.
//
// Auth: x-cron-secret, same as the other crons here.

import { NextResponse } from 'next/server'
import { syncPartnerInstitutionsFromHr, PartnerInstitutionSyncError } from '@/lib/partner-institutions-sync'

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured on server.' }, { status: 503 })
  }
  if ((req.headers.get('x-cron-secret') ?? '') !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncPartnerInstitutionsFromHr()
    console.log(
      `[partner-institutions-sync-cron] ${result.created} created, ${result.updated} updated, ` +
      `${result.deactivated} deactivated, ${result.total} from HR, ${result.errors.length} errors`,
    )
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const status = err instanceof PartnerInstitutionSyncError ? err.status : 500
    console.error('[partner-institutions-sync-cron]', err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status })
  }
}

// Health check, mirroring the other crons: reports whether it *could* run
// without running it.
export async function GET() {
  return NextResponse.json({ cronSecretConfigured: !!process.env.CRON_SECRET })
}
