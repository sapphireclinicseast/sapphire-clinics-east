/**
 * Mentorship billing audit.
 *
 * Sessions ticked "With Mentor" in the Clinic Schedule should carry a
 * "Mentorship" service on their order, so payroll can pay the mentor. The
 * cashier prompt is advisory and never blocks payment, which means a miss is
 * otherwise invisible — this route catches them after the fact.
 *
 * GET /api/mentorship-audit?from=YYYY-MM-DD&to=YYYY-MM-DD[&branch=SBEA]
 *   -> { items: [...], summary: { total, billed, missing, unconverted } }
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'

// Matched on the service NAME rather than a fixed id: the service is set up per
// branch and its id differs between them, while the name is what the cashier
// actually picks. Substring + case-insensitive so "Mentorship Session",
// "OT Mentorship" and "mentorship" all count.
const MENTORSHIP_RE = /mentorship/i

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const branch = searchParams.get('branch') || 'all'

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required (YYYY-MM-DD)' }, { status: 400 })
  }

  const key = process.env.EXTERNAL_API_KEY || process.env.MARKETING_HUB_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'EXTERNAL_API_KEY not configured' }, { status: 500 })
  }

  let sessions: Record<string, unknown>[] = []
  try {
    const res = await fetch(
      `${MARKETING_HUB_URL}/api/queue/mentorship-sessions?from=${from}&to=${to}&branch=${branch}`,
      { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) },
    )
    if (!res.ok) {
      return NextResponse.json(
        { error: `Marketing Hub returned ${res.status}` }, { status: 502 })
    }
    sessions = (await res.json()).items ?? []
  } catch (err) {
    return NextResponse.json(
      { error: 'Could not reach the scheduling system: ' + (err instanceof Error ? err.message : 'unknown') },
      { status: 502 })
  }

  if (sessions.length === 0) {
    return NextResponse.json({ items: [], summary: { total: 0, billed: 0, missing: 0, unconverted: 0 } })
  }

  // Orders are linked to sessions by queueItemId — the same id the POS queue
  // carries. VOIDED orders are excluded: a voided order is not a billing record,
  // so a session whose only order was voided reads as unconverted, not billed.
  const ids = sessions.map(s => String(s.id))
  const orders = await prisma.order.findMany({
    where: { queueItemId: { in: ids }, status: { not: 'VOIDED' } },
    select: {
      id: true, orderNumber: true, queueItemId: true, createdAt: true,
      items: { select: { name: true } },
    },
  })
  const bySession = new Map<string, typeof orders>()
  for (const o of orders) {
    if (!o.queueItemId) continue
    bySession.set(o.queueItemId, [...(bySession.get(o.queueItemId) ?? []), o])
  }

  const items = sessions.map(s => {
    const linked = bySession.get(String(s.id)) ?? []
    const hasMentorship = linked.some(o => o.items.some(i => MENTORSHIP_RE.test(i.name)))
    return {
      ...s,
      orderNumbers: linked.map(o => o.orderNumber).filter(Boolean),
      // Three states, not two. "unconverted" means no order exists yet — that is
      // a cashiering backlog, not a mentorship miss, and lumping the two
      // together would make the miss count look worse than it is.
      state: linked.length === 0 ? 'unconverted' : hasMentorship ? 'billed' : 'missing',
    }
  })

  return NextResponse.json({
    items,
    summary: {
      total: items.length,
      billed: items.filter(i => i.state === 'billed').length,
      missing: items.filter(i => i.state === 'missing').length,
      unconverted: items.filter(i => i.state === 'unconverted').length,
    },
  })
}
