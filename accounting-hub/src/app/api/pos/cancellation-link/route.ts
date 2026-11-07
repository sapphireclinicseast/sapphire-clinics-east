// POS → Operations Hub: link a cancellation fee to the cancellation it settles.
//
// A thin proxy, for one reason: the shared service key must never reach the
// browser. The till talks to this route with its ordinary session, and this
// route talks to the Operations Hub with the key.
//
//   GET  ?q=… | ?patientId=…   find a patient, or list their cancellations
//   POST { action: 'create' }  log a cancellation that was never recorded
//   POST { action: 'link' }    attach this order to one

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const HUB = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'

async function forward(method: 'GET' | 'POST', path: string, body?: unknown) {
  const key = process.env.EXTERNAL_API_KEY ?? ''
  if (!key) {
    return NextResponse.json(
      { error: 'Operations Hub link is not configured on this server.' },
      { status: 503 },
    )
  }
  try {
    const res = await fetch(`${HUB}/api/internal/cancellations${path}`, {
      method,
      headers: {
        'x-api-key': key,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const data = await res.json().catch(() => ({}))
    // Pass the hub's status through: the till distinguishes "already settled"
    // (409) from a plain failure, and says so to the cashier.
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { error: 'Could not reach the Operations Hub: ' + (err as Error).message },
      { status: 502 },
    )
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const qs = new URL(req.url).searchParams.toString()
  return forward('GET', qs ? `?${qs}` : '')
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const user = session.user as { name?: string | null; email?: string | null }
  // Stamped here rather than trusted from the browser: who took the payment is
  // the session's to state.
  return forward('POST', '', { ...body, paidByName: user?.name || user?.email || '' })
}
