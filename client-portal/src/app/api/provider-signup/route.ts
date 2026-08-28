// Server-to-server bridge for provider self-sign-up. Forwards the form (incl.
// the accepted Terms version) to the staff app's guarded signup endpoint, which
// creates the Staff + TherapistAccount and returns a handoff token. We return
// the same-tab handoff URL to redirect to. Secret stays server-side.

import { NextRequest, NextResponse } from 'next/server'

const STAFF = process.env.STAFF_PORTAL_URL ?? 'https://staff.sapphireclinicseast.org'

export async function POST(req: NextRequest) {
  const secret = process.env.PROVIDER_HANDOFF_SECRET
  if (!secret) return NextResponse.json({ error: 'Provider sign-up is not configured yet.' }, { status: 503 })

  const body = await req.text()
  try {
    const res = await fetch(`${STAFF}/api/provider-auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-handoff-secret': secret },
      body,
      signal: AbortSignal.timeout(20_000),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok || !d?.token) {
      return NextResponse.json({ error: d?.error ?? 'Could not create your account.' }, { status: res.status || 502 })
    }
    return NextResponse.json({ redirectUrl: `${STAFF}/provider-handoff?token=${encodeURIComponent(d.token)}` })
  } catch {
    return NextResponse.json({ error: 'Could not reach the staff portal. Please try again.' }, { status: 502 })
  }
}
