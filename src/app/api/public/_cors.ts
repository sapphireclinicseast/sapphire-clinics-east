// Shared CORS helper for /api/public/* endpoints. Allows requests from the
// patient portal origin (client.sapphireclinicseast.org) and local dev.

import { NextResponse } from 'next/server'

const ALLOWED_ORIGINS = [
  'https://client.sapphireclinicseast.org',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
]

export function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function withCors(res: NextResponse, origin: string | null): NextResponse {
  const h = corsHeaders(origin)
  for (const [k, v] of Object.entries(h)) res.headers.set(k, v)
  return res
}

export function preflight(origin: string | null): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}
