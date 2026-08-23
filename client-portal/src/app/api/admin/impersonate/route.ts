// POST /api/admin/impersonate — admin "view as patient".
// Requires the admin session cookie, then forwards to the marketing
// /api/aurora-admin/impersonate with the shared AURORA_ADMIN_TOKEN. Returns a
// patient session token the admin can use to preview that patient's portal.

import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'

const UPSTREAM = process.env.MARKETING_URL ?? 'https://marketing.sapphireclinicseast.org'

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = process.env.AURORA_ADMIN_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'Server not configured.' }, { status: 503 })
  }

  const body = await req.text()
  try {
    const res = await fetch(`${UPSTREAM}/api/aurora-admin/impersonate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-aurora-admin-token': token },
      body,
      signal: AbortSignal.timeout(15_000),
    })
    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    })
  } catch {
    return NextResponse.json({ error: 'Could not reach the data service.' }, { status: 502 })
  }
}
