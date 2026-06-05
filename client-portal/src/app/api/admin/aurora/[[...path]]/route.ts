// Authenticated proxy: client-portal /api/admin/aurora/* → marketing
// /api/aurora-faqs/*. Requires the admin session cookie, then injects the shared
// AURORA_ADMIN_TOKEN so the marketing endpoints authorize the request. The token
// stays server-side and never reaches the browser.

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
  const url = `${UPSTREAM}/api/aurora-faqs${suffix}`

  const init: RequestInit = {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'x-aurora-admin-token': token,
    },
    signal: AbortSignal.timeout(10_000),
  }
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    init.body = await req.text()
  }

  try {
    const res = await fetch(url, init)
    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    })
  } catch {
    return NextResponse.json(
      { error: 'Could not reach the template service. Please try again.' },
      { status: 502 },
    )
  }
}

type Ctx = { params: Promise<{ path?: string[] }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  return proxy(req, (await params).path ?? [])
}
export async function POST(req: NextRequest, { params }: Ctx) {
  return proxy(req, (await params).path ?? [])
}
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return proxy(req, (await params).path ?? [])
}
export async function PUT(req: NextRequest, { params }: Ctx) {
  return proxy(req, (await params).path ?? [])
}
export async function DELETE(req: NextRequest, { params }: Ctx) {
  return proxy(req, (await params).path ?? [])
}
