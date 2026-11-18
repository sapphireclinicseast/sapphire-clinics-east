// POST /api/pos/no-show-log — tell the Operations Hub a no-show was rung up.
//
// The cashier presses "No Show" in the Appointment Queue; the till charges the
// fee and this records it in Patient Relationship, so nobody has to open the
// other hub and type it in again. A fee collected for a no-show nobody logged
// is a fee with no record behind it.
//
// It exists as a server route rather than a fetch from the page because the
// shared service key must not reach a browser.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (!body?.patientId || !body?.branch) {
    return NextResponse.json({ error: 'patientId and branch are required' }, { status: 400 })
  }
  if (!EXTERNAL_API_KEY) {
    return NextResponse.json({ error: 'EXTERNAL_API_KEY is not configured on this hub' }, { status: 503 })
  }

  try {
    const res = await fetch(`${MARKETING_HUB_URL}/api/internal/no-shows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': EXTERNAL_API_KEY },
      body: JSON.stringify({
        patientId: body.patientId,
        branch: body.branch,
        scheduleId: body.scheduleId ?? null,
        paymentType: body.paymentType ?? null,
        remarks: body.remarks ?? null,
      }),
      cache: 'no-store',
      // Bounded: the order has already been taken by the time this runs, and a
      // hung request here would leave the cashier staring at a spinner with a
      // paid order behind it.
      signal: AbortSignal.timeout(15_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[pos/no-show-log]', res.status, data)
      // Reported, not swallowed. The money has moved; if the record did not
      // land the cashier has to know so it can be logged by hand.
      return NextResponse.json(
        { error: data?.error || `Operations Hub returned ${res.status}` },
        { status: 502 },
      )
    }
    return NextResponse.json({ ok: true, deduped: data?.deduped === true })
  } catch (err) {
    console.error('[pos/no-show-log]', err)
    return NextResponse.json(
      { error: 'Could not reach the Operations Hub to record the no-show.' },
      { status: 502 },
    )
  }
}
