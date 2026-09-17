// GET /api/public/register-options
//
// The partner-school list the public patient-registration form offers.
//
// Referring doctors used to be here too and deliberately are not: see
// /api/public/referring-doctors, which matches a few typed characters instead
// of handing over every name.
//
// Public because the form is — a parent filling it in has no account. Both
// lists are therefore trimmed to bare names before they leave here:
//
// Partner names are the ones HR already publishes as answer choices on the
// registration forms themselves, so this exposes nothing the form did not.
//
// A failure returns an empty array and the field falls back to free text: a
// registration lost to a picker that would not load is worse than a name typed
// by hand.

import { NextResponse } from 'next/server'

const HR_URLS = [
  process.env.HR_PLATFORM_URL,
  'http://172.17.0.1:3457',
  'http://172.18.0.1:3457',
  'http://host.docker.internal:3457',
  'http://127.0.0.1:3457',
].filter(Boolean) as string[]
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

// The two registration forms' own partner lists — the ones maintained under
// Registration Forms → Settings, which is where these names are actually
// curated. NOT the partner-institutions agreement records: those are the seven
// signed agreements, while this overlay is the ten choices the form offers, and
// the form is what this page is a sibling of.
//
// Both branches are unioned. They hold the same list today, but they are two
// separate overlays and nothing keeps them in step, so reading only one would
// silently drop a school added to the other.
const REGISTRATION_FORM_IDS = ['GULaVBpI', 'VaCB1bkE']

async function partnerNames(): Promise<string[]> {
  if (!HR_KEY) return []
  const lists = await Promise.all(REGISTRATION_FORM_IDS.map(async formId => {
    for (const base of HR_URLS) {
      try {
        const res = await fetch(`${base}/forms/external/${formId}/partner-options`, {
          headers: { Authorization: `Bearer ${HR_KEY}` },
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) continue
        const data = await res.json()
        if (data?.ok && Array.isArray(data.names)) return data.names as string[]
      } catch { /* try the next address */ }
    }
    return [] as string[]
  }))
  const all = lists.flat().map(n => String(n).trim()).filter(Boolean)
  return [...new Set(all)].sort((a, b) => a.localeCompare(b))
}

export async function GET() {
  // Doctors are NOT here any more. Shipping 154 names to a public page made the
  // clinic's referral network readable in view-source even though the datalist
  // only *displayed* matches. They are searched a few characters at a time
  // through /api/public/referring-doctors instead.
  const partners = await partnerNames()
  return NextResponse.json({ partners })
}
