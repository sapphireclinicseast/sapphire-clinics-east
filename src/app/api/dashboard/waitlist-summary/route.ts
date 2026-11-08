// Waitlist entries nobody has dealt with yet, for the front-desk dashboard.
//
// The Waitlist tab colours a row green when the enquirer has become a patient
// and red when front desk tagged them "will no longer avail". What this counts
// is the rest: submissions that are neither, which is the only part of the list
// that still needs a phone call. The tab shows those as plain rows among
// hundreds of settled ones, which is why they were being missed.
//
// Branch-scoped the same way the tab is, so a front-desk account sees its own
// clinic's enquiries and nothing else.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { loadWaitlistResponses, attachWaitlistFollowUps } from '@/lib/waitlist-source'

export const dynamic = 'force-dynamic'

/** How long an untouched entry has to sit before it counts as overdue. */
const STALE_DAYS = 30
/** Names shown on the card; the rest are a count. */
const SAMPLE = 5

// Answering this costs seven HR calls, and the dashboard is the page every
// front-desk login lands on — so the same answer is held briefly rather than
// recomputed per page view. A minute is short enough that a freshly tagged
// entry drops off the card while the operator is still looking at it, and long
// enough that a busy morning does not turn into a steady drum of requests at
// HR Platform. Keyed by branch; it is only ever a count and five names.
const TTL_MS = 60_000
const cache = new Map<string, { at: number; body: unknown }>()

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string })?.role ?? ''
  let branch = new URL(req.url).searchParams.get('branch') || ''
  if (role === 'AHEA_FRONT_DESK') branch = 'SANDBOX_EAST'
  else if (role === 'AHGH_FRONT_DESK') branch = 'SANDBOX_GREENHILLS'

  const hit = cache.get(branch)
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.body)

  const { responses, failedSources, allFailed } =
    await loadWaitlistResponses({ formKey: 'all', branch })

  // An outage must not read as "nobody is waiting" — the card has to be able to
  // say it could not look rather than show a reassuring zero.
  if (allFailed) {
    return NextResponse.json({
      ok: false,
      warning: `Could not reach HR Platform (${failedSources.join(', ')})`,
    })
  }

  await attachWaitlistFollowUps(responses, 'all')

  // Already a patient? Matched on name, the same way the Waitlist tab decides
  // a row is converted — the submissions carry no patient id to join on. Names
  // are taken across both branches deliberately: someone who enrolled at the
  // other clinic has still been dealt with.
  const patients = await prisma.patient.findMany({ select: { firstName: true, lastName: true } })
  const enrolled = new Set(
    patients
      .map(p => `${p.firstName ?? ''} ${p.lastName ?? ''}`.replace(/\s+/g, ' ').trim().toLowerCase())
      .filter(Boolean),
  )

  const now = Date.now()
  const daysAgo = (iso: string) => {
    const t = new Date(iso).getTime()
    return Number.isFinite(t) ? Math.floor((now - t) / 86_400_000) : null
  }

  let converted = 0
  let declined = 0
  const untouched: { name: string; form: string; branch: string; days: number | null }[] = []

  for (const r of responses) {
    const name = String(r._name ?? '').trim()
    const key = name.toLowerCase()
    if (r._followUp) { declined++; continue }
    if (key && enrolled.has(key)) { converted++; continue }
    untouched.push({
      name: name || 'Unnamed submission',
      form: r._formTitle ?? '',
      branch: r._branch ?? '',
      days: daysAgo(r.submitted_at),
    })
  }

  // responses come back newest first, so the sample is the freshest enquiries —
  // the ones where a call still lands while the family is still looking.
  const body = {
    ok: true,
    total: responses.length,
    untouched: untouched.length,
    converted,
    declined,
    stale: untouched.filter(u => (u.days ?? 0) >= STALE_DAYS).length,
    staleDays: STALE_DAYS,
    newest: untouched.slice(0, SAMPLE),
    // Named so a partial outage is visible rather than silently shrinking the
    // count: one form HR would not answer for looks exactly like a quiet week.
    partial: failedSources,
  }

  // Only a complete read is worth holding. Caching a partial one would pin a
  // short HR hiccup to the card for the next minute.
  if (failedSources.length === 0) cache.set(branch, { at: Date.now(), body })
  return NextResponse.json(body)
}
