// POST /api/decking/snapshot/cron — write today's decking reading.
//
// The board holds no history of its own (weekly template, no dates), so this
// is what makes the History chart possible at all. Miss a day and that day is
// gone for good — there is nothing to reconstruct it from.
//
// Idempotent: upserts on (date, branch, department), so running it twice in a
// day replaces the reading rather than doubling it.
//
// Auth: x-cron-secret, same as the other crons here.

import { NextResponse } from 'next/server'
import { recordDeckingSnapshot } from '@/lib/decking-snapshot'

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured on server.' }, { status: 503 })
  }
  if ((req.headers.get('x-cron-secret') ?? '') !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await recordDeckingSnapshot()
    console.log(`[decking-snapshot] ${result.date}: ${result.written} branch/department rows`)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[decking-snapshot]', err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}

// Health check, mirroring the other crons: reports whether it *could* run
// without running it. A silently missing CRON_SECRET has cost this codebase
// months of unwritten data before.
export async function GET() {
  return NextResponse.json({ cronSecretConfigured: !!process.env.CRON_SECRET })
}
