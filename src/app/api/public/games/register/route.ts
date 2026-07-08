/**
 * Games — Registration intake (Talent Pool)
 *
 * POST /api/public/games/register
 *
 * Public, unauthenticated. Captures the attendee's details at a marketing
 * event and adds them DIRECTLY to the HR Platform's Hiring → Talent Pool
 * (via the keyed external endpoint), tagged source "Marketing Game".
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const HR_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

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

  const professionLabel = profession === 'Others' ? professionOther || 'Others' : profession

  try {
    const res = await fetch(`${HR_URL}/hiring/potential-applicants/external`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${HR_KEY}` },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        phone: mobile,
        position: professionLabel,
        department: profession && profession !== 'Others' ? profession : '',
        birthdate,
        yearsOfPractice,
        source: 'Marketing Game',
        status: 'contacted',
        notes: 'Registered at an Aura Health marketing-event game.',
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
