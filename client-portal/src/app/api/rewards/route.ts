// Server-side proxy: client-portal /api/rewards → accounting-hub wallet-lookup.
// Keeps the browser same-origin and hides the accounting domain.

import { NextRequest, NextResponse } from 'next/server'

const UPSTREAM =
  process.env.ACCOUNTING_URL ?? 'https://accounting.sapphireclinicseast.org'

export async function POST(req: NextRequest) {
  const body = await req.text()
  try {
    const res = await fetch(`${UPSTREAM}/api/public/wallet-lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // Don't hang the user — fail fast.
      signal: AbortSignal.timeout(8_000),
    })
    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Accounting service is unreachable. Please try again in a moment.' },
      { status: 502 },
    )
  }
}
