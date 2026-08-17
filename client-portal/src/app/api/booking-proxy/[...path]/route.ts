// Server-side proxy to marketing.sapphireclinicseast.org/api/public/*
// Keeps browser requests same-origin and hides the upstream URL.

import { NextRequest, NextResponse } from 'next/server'

const UPSTREAM = process.env.MARKETING_URL ?? 'https://operations.sapphireclinicseast.org'

async function proxy(req: NextRequest, method: 'GET' | 'POST', path: string[]) {
  const url = new URL(`${UPSTREAM}/api/public/${path.join('/')}`)
  for (const [k, v] of req.nextUrl.searchParams.entries()) url.searchParams.set(k, v)

  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (method === 'POST') {
    init.body = await req.text()
  }
  const res = await fetch(url.toString(), init)
  // Pass the body through as bytes so binary responses (document/image/PDF
  // file downloads) aren't corrupted by UTF-8 text decoding. JSON still works.
  const buf = await res.arrayBuffer()
  const headers: Record<string, string> = {
    'Content-Type': res.headers.get('content-type') ?? 'application/json',
  }
  const cd = res.headers.get('content-disposition')
  if (cd) headers['Content-Disposition'] = cd
  return new NextResponse(buf, { status: res.status, headers })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxy(req, 'GET', path)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxy(req, 'POST', path)
}
