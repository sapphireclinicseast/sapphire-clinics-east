/**
 * Games — Registration intake (Talent Pool)
 *
 * POST /api/public/games/register
 *
 * Public, unauthenticated. Captures the attendee's details at a marketing
 * event and forwards them to the HR Platform's seminar-notification list —
 * the same intake that feeds Hiring → "Talent Pool" (an entry there can be
 * one-click "Converted to Talent Pool" by HR).
 *
 * Mirrors the server-to-server pattern used by the registration-forms and
 * peer-eval proxies: hit the internal HR base (HR_PLATFORM_URL) with the
 * public route path. Nginx exposes the same route publicly under /api.
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const HR_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'

// Profession values the HR notification-signup endpoint accepts.
const ALLOWED_PROFESSIONS = ['OT', 'PT', 'SLP', 'SPED', 'Psychology', 'MD', 'Orthosis', 'Others']

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  }

  const firstName = String(body.firstName ?? '').trim()
  const lastName = String(body.lastName ?? '').trim()
  const mobile = String(body.mobile ?? '').trim()
  const email = String(body.email ?? '').trim()
  const professionRaw = String(body.profession ?? '').trim()
  const profession = ALLOWED_PROFESSIONS.includes(professionRaw) ? professionRaw : ''
  const professionOther = String(body.professionOther ?? '').trim()
  const birthdate = String(body.birthdate ?? '').trim()
  const yopRaw = body.yearsOfPractice
  const yearsOfPractice =
    yopRaw === null || yopRaw === '' || yopRaw === undefined ? null : Number(yopRaw)

  if (!firstName || !lastName || !mobile || !email) {
    return NextResponse.json(
      { ok: false, error: 'Please fill in your name, mobile, and email.' },
      { status: 400 },
    )
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: 'Please enter a valid email address.' },
      { status: 400 },
    )
  }

  try {
    const res = await fetch(`${HR_URL}/seminars/notification-signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName,
        lastName,
        mobile,
        email,
        profession,
        professionOther,
        birthdate,
        yearsOfPractice,
        // Provenance tag so HR knows this lead came from a marketing game event.
        source: 'marketing-games',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const data = await res.json().catch(() => ({ ok: false }))
    if (!res.ok || !data.ok) {
      return NextResponse.json(
        { ok: false, error: data.error || 'Could not save your details. Please try again.' },
        { status: 502 },
      )
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    // Visible in `docker logs sapphire_app` so an outage is obvious.
    console.error('[games/register] HR forward failed:', e?.message || e)
    return NextResponse.json(
      { ok: false, error: 'Registration service is unreachable. Please try again.' },
      { status: 502 },
    )
  }
}
