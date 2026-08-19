// Server-side proxy to marketing.sapphireclinicseast.org/api/public/*
// Keeps browser requests same-origin and hides the upstream URL.

import { NextRequest, NextResponse } from 'next/server'

const UPSTREAM = process.env.MARKETING_URL ?? 'https://operations.sapphireclinicseast.org'

async function proxy(req: NextRequest, method: 'GET' | 'POST' | 'DELETE', path: string[]) {
  const url = new URL(`${UPSTREAM}/api/public/${path.join('/')}`)
  for (const [k, v] of req.nextUrl.searchParams.entries()) url.searchParams.set(k, v)

  const init: RequestInit = { method }
  const reqHeaders: Record<string, string> = {}
  // Forward Range so upstream can answer with 206 — required for <audio>/<video>
  // playback and seeking (Safari/iOS refuse media without it).
  const range = req.headers.get('range')
  if (range) reqHeaders['Range'] = range
  if (method === 'POST') {
    const ct = req.headers.get('content-type') ?? 'application/json'
    if (ct.startsWith('multipart/')) {
      // Forward file uploads verbatim (raw bytes + the boundary content-type)
      // so the upstream can parse the multipart form.
      init.body = await req.arrayBuffer()
      reqHeaders['Content-Type'] = ct
    } else {
      init.body = await req.text()
      reqHeaders['Content-Type'] = 'application/json'
    }
  }
  init.headers = reqHeaders
  const res = await fetch(url.toString(), init)
  // Pass the body through as bytes so binary responses (document/image/PDF
  // file downloads, audio/video streams) aren't corrupted by UTF-8 text
  // decoding. JSON still works.
  const buf = await res.arrayBuffer()
  const headers: Record<string, string> = {
    'Content-Type': res.headers.get('content-type') ?? 'application/json',
  }
  // Pass through the headers media elements need for streaming/seeking.
  for (const h of ['content-disposition', 'content-range', 'accept-ranges', 'content-length']) {
    const v = res.headers.get(h)
    if (v) headers[h.replace(/(^|-)([a-z])/g, (_, p, c) => p + c.toUpperCase())] = v
  }
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxy(req, 'DELETE', path)
}
