// GET /api/internal/referrers?type=DOCTOR&q=munc
//
// Referrer names for the Operations Hub's registration form, matched against
// what the patient has typed so far.
//
// `q` is REQUIRED and the full list is never returned. This feeds a page anyone
// can open, and handing it 154 doctor names would make the clinic's referral
// network enumerable by a stranger who only had to open the page. Matching here
// rather than in the browser is the point: a datalist filters what is *shown*
// while the whole list still sits in the page source.
//
// Matching is by word prefix, so "munc" finds "DR. AIDA MUNCADA" — a parent
// knows the surname, not the stored form. The honorific is skipped, or every
// name would come back the moment someone typed "dr".
//
// Live on purpose: a doctor added under Referral → Referrers → Doctors here is
// findable on the next keystroke, with nothing to sync.
//
// Auth: Authorization: Bearer EXTERNAL_API_KEY — the same shared inter-hub key
// as /api/internal/vip-status.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const TYPES = new Set(['DOCTOR', 'LAW_FIRM', 'PARTNER_SCHOOL'])

// Three characters before anything comes back, and at most ten results. Neither
// stops a determined person walking the alphabet, but together they mean the
// list cannot be lifted in one request, which is the difference that matters.
const MIN_QUERY = 3
const MAX_RESULTS = 10

const HONORIFICS = new Set(['dr', 'dr.', 'doc', 'doctor', 'prof', 'prof.'])

function verifyKey(req: NextRequest): boolean {
  const key = process.env.EXTERNAL_API_KEY
  if (!key) return false
  return req.headers.get('authorization') === `Bearer ${key}`
}

/** Does any word of `name` start with `q`, ignoring the honorific? */
function matches(name: string, q: string): boolean {
  const words = name.toLowerCase().split(/[\s,.]+/).filter(Boolean)
  return words.some(w => !HONORIFICS.has(w) && w.startsWith(q))
}

export async function GET(req: NextRequest) {
  if (!verifyKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = req.nextUrl.searchParams
  const rawType = params.get('type') ?? 'DOCTOR'
  const type = TYPES.has(rawType) ? rawType : 'DOCTOR'
  const q = (params.get('q') ?? '').trim().toLowerCase()

  // Said plainly rather than answered with an empty array, so a caller that
  // forgot the parameter sees why instead of concluding there are no doctors.
  if (q.length < MIN_QUERY) {
    return NextResponse.json({ ok: true, type, names: [], minQuery: MIN_QUERY })
  }

  // Narrowed in SQL first so the in-memory pass is over matches, not the whole
  // table; the word-prefix rule is then applied in full here, since "contains"
  // alone would let "ida" match "AIDA".
  const rows = await prisma.referrer.findMany({
    where: { isActive: true, type, name: { contains: q, mode: 'insensitive' } },
    select: { name: true },
    orderBy: { name: 'asc' },
  })

  const names = [...new Set(
    rows.map(r => r.name.trim()).filter(n => n && matches(n, q)),
  )].slice(0, MAX_RESULTS)

  return NextResponse.json({ ok: true, type, names })
}
