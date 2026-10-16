// Server-side proxy to the operations hub /api/public/*
// Keeps browser requests same-origin and hides the upstream URL.
//
// Session cookie (durable auth): the patient's signed token also lives in an
// HttpOnly cookie set here, on the client-portal's own domain. This survives
// iOS Safari's 7-day eviction of script-written localStorage, which otherwise
// logged patients out and showed "your session has expired". The cookie is the
// source of truth — we inject it into every upstream call — and it is refreshed
// on each /me load (sliding renewal), so an active session never expires.

import { NextRequest, NextResponse } from 'next/server'

const UPSTREAM = process.env.MARKETING_URL ?? 'https://operations.sapphireclinicseast.org'

const COOKIE = 'scei_pt'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14 // 14 days — matches the token TTL
// Upstream paths that mint/return a session token in their JSON response.
const TOKEN_ISSUING_PATHS = new Set([
  'patients/login',
  'patients/lookup',
  'patients/set-password',
  'patients/register',
  'patients/me',
])

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}

async function proxy(req: NextRequest, method: 'GET' | 'POST' | 'DELETE', path: string[]) {
  const pathStr = path.join('/')
  const url = new URL(`${UPSTREAM}/api/public/${pathStr}`)
  for (const [k, v] of req.nextUrl.searchParams.entries()) url.searchParams.set(k, v)

  // Cookie is the source of truth for the session token. When present, inject it
  // into the upstream request, overriding whatever (possibly stale) token the
  // browser sent in the query/body. Falls back to the client-supplied token when
  // there is no cookie (e.g. cookies blocked).
  const cookieTok = req.cookies.get(COOKIE)?.value || ''

  const init: RequestInit = { method }
  const reqHeaders: Record<string, string> = {}
  // Forward Range so upstream can answer with 206 — required for <audio>/<video>
  // playback and seeking (Safari/iOS refuse media without it).
  const range = req.headers.get('range')
  if (range) reqHeaders['Range'] = range

  if (cookieTok && (method === 'GET' || method === 'DELETE')) {
    url.searchParams.set('token', cookieTok)
  }

  if (method === 'POST') {
    const ct = req.headers.get('content-type') ?? 'application/json'
    if (ct.startsWith('multipart/')) {
      // Forward file uploads verbatim (raw bytes + the boundary content-type)
      // so the upstream can parse the multipart form. Multipart carries its own
      // `token` form field (from the client), so we leave the body untouched.
      init.body = await req.arrayBuffer()
      reqHeaders['Content-Type'] = ct
    } else {
      const raw = await req.text()
      reqHeaders['Content-Type'] = 'application/json'
      if (cookieTok) {
        // Inject the cookie token into the JSON body.
        try {
          const obj = raw ? JSON.parse(raw) : {}
          obj.token = cookieTok
          init.body = JSON.stringify(obj)
        } catch {
          init.body = raw
        }
      } else {
        init.body = raw
      }
    }
  }
  init.headers = reqHeaders

  const res = await fetch(url.toString(), init)
  // Pass the body through as bytes so binary responses (document/image/PDF
  // file downloads, audio/video streams) aren't corrupted by UTF-8 text
  // decoding. JSON still works.
  const buf = await res.arrayBuffer()
  const contentType = res.headers.get('content-type') ?? 'application/json'
  const headers: Record<string, string> = { 'Content-Type': contentType }
  // Pass through the headers media elements need for streaming/seeking.
  for (const h of ['content-disposition', 'content-range', 'accept-ranges', 'content-length']) {
    const v = res.headers.get(h)
    if (v) headers[h.replace(/(^|-)([a-z])/g, (_, p, c) => p + c.toUpperCase())] = v
  }

  const out = new NextResponse(buf, { status: res.status, headers })

  // Set / refresh the durable session cookie from token-issuing JSON responses.
  if (
    res.status === 200 &&
    TOKEN_ISSUING_PATHS.has(pathStr) &&
    contentType.includes('application/json')
  ) {
    try {
      const json = JSON.parse(Buffer.from(buf).toString('utf8'))
      if (json && typeof json.token === 'string' && json.token) {
        out.cookies.set(COOKIE, json.token, cookieOpts(COOKIE_MAX_AGE))
      }
    } catch {
      /* non-JSON or no token — nothing to persist */
    }
  }

  // A 401 on a token-bearing path means the session is dead/invalid — clear the
  // cookie so a stale token doesn't keep getting retried.
  if (res.status === 401 && cookieTok) {
    out.cookies.set(COOKIE, '', cookieOpts(0))
  }

  return out
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
