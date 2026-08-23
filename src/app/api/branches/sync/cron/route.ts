// POST /api/branches/sync/cron
//
// Scheduled pull of the HR Platform Branches Registry into the local HrBranch
// cache. Runs the same code as the admin "Sync Branches" button.
//
// This exists because HrBranch is what makes HR Platform the source of truth
// for branch contact details at runtime: clinic-schedule emails resolve which
// mailbox they send FROM via HrBranch.emailMain (see @/lib/branch-notify-config).
// A cache that only fills when someone clicks a button isn't a source of truth
// — an email address corrected in HR Platform would never reach those emails.
//
// Idempotent: a full upsert-and-prune, safe to fire as often as you like.
//
// Auth: requires `x-cron-secret: $CRON_SECRET` header, same as the class-portal
// crons. The secret lives in the app's .env on the VPS — never client-visible.

import { NextResponse } from 'next/server'
import { syncBranchesFromHr } from '@/lib/sync-branches'

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured on server.' }, { status: 503 })
  }
  const got = req.headers.get('x-cron-secret') ?? ''
  if (got !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await syncBranchesFromHr()
  if (!result.ok) {
    console.error('[branches-sync-cron]', result.error)
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 })
  }

  console.log(
    `[branches-sync-cron] ${result.synced} synced ` +
    `(${result.created} new, ${result.updated} updated, ${result.deleted} removed)`,
  )
  return NextResponse.json(result)
}

// Health probe — lets you confirm the secret is actually present in the
// container without triggering a sync (a missing CRON_SECRET is invisible
// otherwise: the POST just 503s into the cron log).
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/branches/sync/cron',
    method: 'POST with x-cron-secret header',
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
  })
}
