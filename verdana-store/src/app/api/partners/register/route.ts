import { NextResponse } from 'next/server'
import {
  readPartners, writePartners, hashPassword, signSession, publicPartner,
  PARTNER_COOKIE, THERAPIST_RANGES, PATIENT_RANGES, type Partner,
} from '@/lib/partners'

const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

export async function POST(request: Request) {
  try {
    const b = await request.json()
    const val = (k: string) => String(b?.[k] ?? '').trim()

    const institution = val('institution')
    const repFirstName = val('repFirstName')
    const repLastName = val('repLastName')
    const email = val('email').toLowerCase()
    const mobile = val('mobile')
    const therapistsRange = val('therapistsRange')
    const patientsRange = val('patientsRange')
    const username = val('username').toLowerCase()
    const password = String(b?.password ?? '')
    const website = val('website')

    // ── Validation ──
    const missing: string[] = []
    for (const [k, v] of Object.entries({ institution, repFirstName, repLastName, email, mobile, therapistsRange, patientsRange, username })) {
      if (!v) missing.push(k)
    }
    if (missing.length) return NextResponse.json({ error: 'Please complete all required fields.', missing }, { status: 400 })
    if (!emailOk(email)) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) return NextResponse.json({ error: 'Username must be 3–30 characters (letters, numbers, . _ -).' }, { status: 400 })
    if (!THERAPIST_RANGES.includes(therapistsRange) || !PATIENT_RANGES.includes(patientsRange)) {
      return NextResponse.json({ error: 'Please choose from the provided ranges.' }, { status: 400 })
    }

    const partners = await readPartners()
    if (partners.some((p) => p.username.toLowerCase() === username)) {
      return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 })
    }
    if (partners.some((p) => p.email.toLowerCase() === email)) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 })
    }

    const partner: Partner = {
      id: `PTR-${Date.now()}-${Math.floor(Number(String(Date.now()).slice(-4)))}`,
      createdAt: new Date().toISOString(),
      institution, website: website || undefined,
      repFirstName, repLastName, email, mobile,
      therapistsRange, patientsRange,
      username, passwordHash: hashPassword(password),
      tier: null, subscriptionStatus: 'unpaid', paidAt: null, expiresAt: null,
      patientCode: null, consultantCode: null,
    }
    partners.unshift(partner)
    await writePartners(partners)

    const res = NextResponse.json({ ok: true, partner: publicPartner(partner) })
    res.cookies.set(PARTNER_COOKIE, signSession(partner.id), {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 30 * 86400,
    })
    return res
  } catch (e) {
    console.error('Partner register error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
