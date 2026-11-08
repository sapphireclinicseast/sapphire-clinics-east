// POST /api/decking/sheet-sync — reconcile a branch's decking spreadsheet with
// the hub, in both directions.
//
// Two callers: a signed-in admin pressing a button, and the scheduler. Both go
// through the same function, so the manual run and the unattended one cannot
// behave differently — which is the usual way a sync earns distrust.
//
// Pull happens before push inside syncBranch(): pushing first would rewrite the
// cells front desk had just edited and their work would be gone before anything
// read it.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { syncBranch } from '@/lib/decking-sheet/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Which spreadsheet belongs to which branch. */
const SHEETS: Record<string, string | undefined> = {
  SBEA: process.env.GOOGLE_SHEETS_AHEA_ID,
  SBGH: process.env.GOOGLE_SHEETS_AHGH_ID,
}

const ALLOWED = new Set(['ADMIN', 'MARKETING_ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN', 'AHEA_FRONT_DESK', 'AHGH_FRONT_DESK'])

export async function POST(req: NextRequest) {
  // The scheduler has no session, so it presents the cron secret instead. Both
  // paths are checked explicitly: a route that falls through to "allowed" when
  // neither is present is how an internal endpoint becomes a public one.
  const secret = process.env.CRON_SECRET ?? ''
  const viaCron = !!secret && req.headers.get('x-cron-secret') === secret

  if (!viaCron) {
    const session = await auth()
    const role = (session?.user as { role?: string })?.role ?? ''
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ALLOWED.has(role)) return NextResponse.json({ error: 'Front-desk or admin access required' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const asked = String(body.branch ?? '').toUpperCase()
  const branches = asked ? [asked] : Object.keys(SHEETS)

  const reports = []
  for (const branch of branches) {
    const spreadsheetId = SHEETS[branch]
    if (!spreadsheetId) {
      reports.push({ branch, errors: [`No spreadsheet configured — set GOOGLE_SHEETS_${branch === 'SBEA' ? 'AHEA' : 'AHGH'}_ID.`], pushed: [], applied: [], conflicts: [], unknownPatients: [] })
      continue
    }
    reports.push(await syncBranch(branch, spreadsheetId))
  }

  // Conflicts and unrecognised names are the two things a person has to act
  // on, so they are counted at the top rather than buried in the per-branch
  // detail — a report nobody reads is the same as no report.
  const conflicts = reports.reduce((n, r) => n + r.conflicts.length, 0)
  const applied = reports.reduce((n, r) => n + r.applied.length, 0)
  const unknown = reports.reduce((n, r) => n + r.unknownPatients.length, 0)

  return NextResponse.json({
    ok: reports.every(r => r.errors.length === 0),
    applied,
    conflicts,
    unknownPatients: unknown,
    reports,
  })
}
