// Authenticated proxy: client-portal /api/admin/data/* → marketing
// /api/aurora-admin/*. Requires the admin session cookie, then injects the
// shared AURORA_ADMIN_TOKEN. Read-only admin dashboards (sessions, payments…).

import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'

const UPSTREAM = process.env.MARKETING_URL ?? 'https://marketing.sapphireclinicseast.org'

async function proxy(req: NextRequest, path: string[]) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = process.env.AURORA_ADMIN_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'Server not configured.' }, { status: 503 })
  }

  const suffix = path.length ? `/${path.join('/')}` : ''
  const url = `${UPSTREAM}/api/aurora-admin${suffix}${req.nextUrl.search}`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'x-aurora-admin-token': token },
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

type Ctx = { params: Promise<{ path?: string[] }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  return proxy(req, (await params).path ?? [])
}
