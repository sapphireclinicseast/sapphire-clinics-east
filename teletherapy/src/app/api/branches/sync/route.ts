/**
 * Branches Sync — pull the Branches Registry from HR Platform into the shared
 * HrBranch cache (admin-triggered, full replace incl. deletes). The fetch +
 * upsert logic lives in `@/lib/branch-sync` and is shared with an opportunistic
 * background refresh fired from the email path (see `maybeSyncBranches`), so a
 * sender changed in HR Hub also propagates automatically.
 *
 * NOTE: writes to the "HrBranch" table in the sapphire_marketing database,
 * which teletherapy shares with Operations Hub — either app's "Sync Branches"
 * refreshes what both see.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { syncBranchesFromHr } from '@/lib/branch-sync'

export async function POST() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  try {
    const result = await syncBranchesFromHr({ deleteMissing: true })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }
}
