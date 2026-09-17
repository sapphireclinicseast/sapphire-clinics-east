// GET /api/public/referring-doctors?q=munc
//
// Type-ahead for the referring-doctor field on the public registration form.
// Returns only the names matching what has been typed — never the whole list.
//
// The list itself lives in Accounting Hub (Referral → Referrers → Doctors) and
// is read live, so a doctor added there is findable on the next keystroke.
//
// Why a search endpoint rather than the list plus a datalist: a datalist
// filters what the browser SHOWS while the full list still sits in the page
// source. On a page anyone can open, that published all 154 doctors to anyone
// who pressed view-source. Matching upstream means only matches ever leave the
// building.
//
// Rate limited per IP. Three characters minimum and ten results per request
// already stop the list being lifted in one go; this stops it being walked
// quickly instead.

import { NextRequest, NextResponse } from 'next/server'

const ACCT_URL = process.env.ACCOUNTING_HUB_URL ?? 'https://accounting.sapphireclinicseast.org'
const ACCT_KEY = process.env.EXTERNAL_API_KEY ?? ''

const MIN_QUERY = 3
const WINDOW_MS = 60 * 1000
const MAX_PER_WINDOW = 40   // generous for one person typing, useless for a scrape
const hits = new Map<string, { count: number; resetAt: number }>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const rec = hits.get(ip)
  if (!rec || now > rec.resetAt) { hits.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return false }
  rec.count += 1
  return rec.count > MAX_PER_WINDOW
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  // Answered as "nothing matched" rather than an error: the field is optional
  // and a short query is the normal state on the way to a longer one.
  if (q.length < MIN_QUERY) return NextResponse.json({ names: [] })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip') || 'unknown'
  if (rateLimited(ip)) return NextResponse.json({ names: [] }, { status: 429 })

  if (!ACCT_KEY) return NextResponse.json({ names: [] })

  try {
    const res = await fetch(
      `${ACCT_URL}/api/internal/referrers?type=DOCTOR&q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${ACCT_KEY}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return NextResponse.json({ names: [] })
    const data = await res.json()
    return NextResponse.json({ names: Array.isArray(data.names) ? data.names : [] })
  } catch {
    // Silent on purpose: the field accepts a typed name, so a suggestion
    // service that is down should cost the parent nothing.
    return NextResponse.json({ names: [] })
  }
}
