// GET /api/public/register-options
//
// The two lists the public patient-registration form offers: partner schools
// and referring doctors.
//
// Public because the form is — a parent filling it in has no account. Both
// lists are therefore trimmed to bare names before they leave here:
//
//   partners — the names HR already publishes on the registration forms, which
//              the form itself has always shown as answer choices
//   doctors  — names only, no affiliation, specialization or branch scope
//
// Named lists on a public form are a disclosure either way: it makes the
// clinic's referring doctors enumerable by anyone who opens the page. The
// alternative is a free-text box and the desk retyping every name later, which
// is what this replaces. Flagged rather than decided quietly — see the PR.
//
// Neither list is fatal to the form: a failure returns an empty array and the
// field falls back to free text, because a registration lost to a dropdown
// that would not load is worse than a name typed by hand.

import { NextResponse } from 'next/server'

const ACCT_URL = process.env.ACCOUNTING_HUB_URL ?? 'https://accounting.sapphireclinicseast.org'
const ACCT_KEY = process.env.EXTERNAL_API_KEY ?? ''

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

/** Active DOCTOR referrers, by name, from Accounting Hub. */
async function doctorNames(): Promise<string[]> {
  if (!ACCT_KEY) return []
  try {
    const res = await fetch(`${ACCT_URL}/api/internal/referrers?type=DOCTOR`, {
      headers: { Authorization: `Bearer ${ACCT_KEY}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data.names) ? data.names : []
  } catch {
    return []
  }
}

export async function GET() {
  const [partners, doctors] = await Promise.all([partnerNames(), doctorNames()])
  return NextResponse.json({ partners, doctors })
}
