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
// knows the surname, not the stored form. BOTH SIDES are tokenized the same
// way and honorifics dropped from each: a parent types "dr. aida" far more
// often than "aida", and an earlier version compared whole stored words
// against the entire typed string, so typing the honorific first made every
// further keystroke unmatchable.
//
// Every typed word must prefix some word of the name, in any order, so
// "munc aida" finds the same person as "aida munc".
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
//
// The three are counted over the NAME part only, so "dr. a" is one character,
// not five — otherwise the honorific would buy a shorter query than intended.
const MIN_QUERY = 3
const MAX_RESULTS = 10

// Written with and without the point because the split below keeps neither form
// intact on its own, and this set is applied to raw input too.
const HONORIFICS = new Set(['dr', 'dr.', 'doc', 'doctor', 'prof', 'prof.', 'md', 'm.d.'])

/** Lowercase words, honorifics dropped — used on both the name and the query. */
function nameWords(s: string): string[] {
  return s.toLowerCase().split(/[\s,.]+/).filter(w => w && !HONORIFICS.has(w))
}

function verifyKey(req: NextRequest): boolean {
  const key = process.env.EXTERNAL_API_KEY
  if (!key) return false
  return req.headers.get('authorization') === `Bearer ${key}`
}

/** Does every typed word prefix some word of `name`, in any order? */
function matches(name: string, terms: string[]): boolean {
  const words = nameWords(name)
  return terms.every(t => words.some(w => w.startsWith(t)))
}

export async function GET(req: NextRequest) {
  if (!verifyKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = req.nextUrl.searchParams
  const rawType = params.get('type') ?? 'DOCTOR'
  const type = TYPES.has(rawType) ? rawType : 'DOCTOR'
  const terms = nameWords(params.get('q') ?? '')

  // Said plainly rather than answered with an empty array, so a caller that
  // forgot the parameter sees why instead of concluding there are no doctors.
  // "dr." alone leaves no terms at all and lands here, which is right: it names
  // nobody.
  if (terms.join('').length < MIN_QUERY) {
    return NextResponse.json({ ok: true, type, names: [], minQuery: MIN_QUERY })
  }

  // Narrowed in SQL first so the in-memory pass is over candidates, not the
  // whole table. The longest term is the cheapest filter that cannot drop a
  // real match: every term has to appear, so one of them certainly does.
  // "contains" is only the narrowing — the word-prefix rule below is what
  // decides, since "contains" alone would let "ida" match "AIDA".
  const longest = terms.reduce((a, b) => (b.length > a.length ? b : a))
  const rows = await prisma.referrer.findMany({
    where: { isActive: true, type, name: { contains: longest, mode: 'insensitive' } },
    select: { name: true },
    orderBy: { name: 'asc' },
  })

  const names = [...new Set(
    rows.map(r => r.name.trim()).filter(n => n && matches(n, terms)),
  )].slice(0, MAX_RESULTS)

  return NextResponse.json({ ok: true, type, names })
}
