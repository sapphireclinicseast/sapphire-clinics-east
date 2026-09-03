// GET /api/loa-form/patients?q=... — patient name lookup for the public LOA form.
//
// PUBLIC AND UNAUTHENTICATED, because the LOA form is a standing link a patient
// opens without an account. That makes this the most sensitive endpoint in the
// feature: "is <name> a patient here" is itself health information for a
// therapy clinic, so this is deliberately built to answer a patient who knows
// their own name, not to let anyone browse the register.
//
// What that means concretely:
//   * a query under MIN_QUERY characters returns nothing — no browsing from "a"
//   * results are capped, and a query matching more than the cap returns
//     NOTHING rather than the first N, so a broad query cannot be used to walk
//     the list. Only a query specific enough to identify a person answers.
//   * the payload is id + display name only. No phone, email, birthdate,
//     branch or clinical detail ever leaves through here.
//   * per-IP rate limiting, so the endpoint cannot be ground through
//     name-by-name at speed.
//
// A stricter version of this would ask for a birth date alongside the name
// before returning anything; see the note in the LOA Submission section.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const MIN_QUERY = 3
// Above this many matches the query is too broad to be someone looking
// themselves up, so it is refused rather than truncated.
const MAX_MATCHES = 8

// Small fixed-window limiter. In-memory, so it resets on deploy and is per
// instance — enough to stop a scripted sweep, not a substitute for a WAF.
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 20
const hits = new Map<string, { count: number; resetAt: number }>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const rec = hits.get(ip)
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  rec.count += 1
  return rec.count > MAX_PER_WINDOW
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Too many searches. Please wait a moment.' }, { status: 429 })
  }

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < MIN_QUERY) {
    return NextResponse.json({ patients: [], needMore: true })
  }

  // Match the whole name in either order ("dela cruz maria" / "maria dela cruz")
  // so a patient typing their name naturally finds themselves.
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 4)
  const where = {
    AND: terms.map(t => ({
      OR: [
        { firstName: { contains: t, mode: 'insensitive' as const } },
        { lastName:  { contains: t, mode: 'insensitive' as const } },
      ],
    })),
  }

  // Count first: a query that matches too many people is refused outright.
  const total = await prisma.patient.count({ where })
  if (total === 0) return NextResponse.json({ patients: [], notFound: true })
  if (total > MAX_MATCHES) {
    return NextResponse.json({ patients: [], tooMany: true })
  }

  const patients = await prisma.patient.findMany({
    where,
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: MAX_MATCHES,
  })

  return NextResponse.json({
    patients: patients.map(p => ({ id: p.id, name: `${p.lastName}, ${p.firstName}` })),
  })
}
