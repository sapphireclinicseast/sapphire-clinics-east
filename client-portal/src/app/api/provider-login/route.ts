// Server-to-server bridge: the branded provider login form posts here; we
// forward the credentials to the staff app's guarded verify endpoint (the
// PROVIDER_HANDOFF_SECRET never reaches the browser) and return the same-tab
// handoff URL to redirect to. Credentials are only ever handled server-side.

import { NextRequest, NextResponse } from 'next/server'

const STAFF = process.env.STAFF_PORTAL_URL ?? 'https://staff.sapphireclinicseast.org'

export async function POST(req: NextRequest) {
  const secret = process.env.PROVIDER_HANDOFF_SECRET
  if (!secret) return NextResponse.json({ error: 'Provider sign-in is not configured yet.' }, { status: 503 })

  const body = await req.text()
  try {
    const res = await fetch(`${STAFF}/api/provider-auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-handoff-secret': secret },
      body,
      signal: AbortSignal.timeout(15_000),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok || !d?.token) {
      return NextResponse.json({ error: d?.error ?? 'Invalid email or password' }, { status: res.status || 502 })
    }
    return NextResponse.json({ redirectUrl: `${STAFF}/provider-handoff?token=${encodeURIComponent(d.token)}` })
  } catch {
    return NextResponse.json({ error: 'Could not reach the staff portal. Please try again.' }, { status: 502 })
  }
}
