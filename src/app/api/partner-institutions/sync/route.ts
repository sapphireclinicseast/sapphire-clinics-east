/**
 * Partner Institutions Sync — the page's "Sync from HR" button.
 *
 * The work itself lives in @/lib/partner-institutions-sync so the nightly
 * cron (api/partner-institutions/sync/cron) runs the identical code path.
 * This route only adds the human check: who is allowed to press the button.
 * Front Desk can VIEW partner institutions but does not trigger the sync —
 * only admin-tier roles do, same tier as Staff Sync.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { syncPartnerInstitutionsFromHr, PartnerInstitutionSyncError } from '@/lib/partner-institutions-sync'

export async function POST() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as { role?: string }).role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    return NextResponse.json(await syncPartnerInstitutionsFromHr())
  } catch (err) {
    if (err instanceof PartnerInstitutionSyncError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[partner-institutions-sync]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
