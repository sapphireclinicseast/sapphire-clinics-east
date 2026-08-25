/**
 * Scan the sending mailboxes for delivery-failure reports.
 *
 * POST /api/email/bounces/scan
 *   Auth: `x-cron-secret: $CRON_SECRET` (scheduled) OR an admin session (manual).
 *   Body: { afterDays?: number, maxMessages?: number, dryRun?: boolean }
 *
 * Only HARD bounces unsubscribe a patient. Soft bounces (full mailbox,
 * throttling) are recorded for visibility and nothing else — see bounce-scan.ts.
 *
 * dryRun is the safe first move on a mailbox with years of history: it reports
 * what WOULD be recorded and unsubscribed without touching anything.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { scanAllMailboxes } from '@/lib/bounce-scan'

const ADMIN_ROLES = ['ADMIN', 'MARKETING_ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN']

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('x-cron-secret')

  let authorized = false
  if (secret && provided && provided === secret) {
    authorized = true
  } else {
    // Manual run from the hub — admins only, since this can unsubscribe people.
    const session = await auth()
    const role = (session?.user as { role?: string } | undefined)?.role ?? ''
    authorized = !!session && ADMIN_ROLES.includes(role)
  }
  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const afterDays = Number(body?.afterDays) > 0 ? Number(body.afterDays) : 90
  const maxMessages = Number(body?.maxMessages) > 0 ? Number(body.maxMessages) : 500
  const dryRun = body?.dryRun === true

  try {
    const results = await scanAllMailboxes({ afterDays, maxMessages, dryRun })
    const totals = results.reduce(
      (acc, r) => ({
        reportsSeen: acc.reportsSeen + r.reportsSeen,
        newBounces: acc.newBounces + r.newBounces,
        hard: acc.hard + r.hard,
        soft: acc.soft + r.soft,
        unsubscribed: acc.unsubscribed + r.unsubscribed,
      }),
      { reportsSeen: 0, newBounces: 0, hard: 0, soft: 0, unsubscribed: 0 },
    )
    return NextResponse.json({ ok: true, dryRun, totals, results })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Scan failed' },
      { status: 500 },
    )
  }
}

/** Recent bounces, newest first — for an admin view or a quick check. */
export async function GET(req: Request) {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role ?? ''
  if (!session || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { prisma } = await import('@/lib/prisma')
  const url = new URL(req.url)
  const kind = url.searchParams.get('kind')

  const bounces = await prisma.emailBounce.findMany({
    where: kind === 'HARD' || kind === 'SOFT' ? { kind } : undefined,
    orderBy: { detectedAt: 'desc' },
    take: 200,
  })
  return NextResponse.json({ ok: true, bounces })
}
