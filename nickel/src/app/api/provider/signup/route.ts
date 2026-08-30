import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, signSession, SESSION_COOKIE, cookieOptions } from '@/lib/auth'

const PROFESSIONS = new Set(['PT', 'OT', 'SLP', 'SPED', 'PSYCHOLOGY', 'MD', 'ORTHOSIS'])

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const firstName = String(b.firstName ?? '').trim()
  const lastName = String(b.lastName ?? '').trim()
  const email = String(b.email ?? '').toLowerCase().trim()
  const password = String(b.password ?? '')
  const phone = String(b.phone ?? '').trim() || null
  const profession = String(b.profession ?? '').toUpperCase()
  const termsVersion = String(b.termsVersion ?? '').trim()
  const dobStr = String(b.dob ?? '').trim()
  const dob = /^\d{4}-\d{2}-\d{2}$/.test(dobStr) ? new Date(`${dobStr}T00:00:00.000Z`) : null

  if (!firstName || !lastName || !email) return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
  if (!email.includes('@')) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  if (!PROFESSIONS.has(profession)) return NextResponse.json({ error: 'Please choose your profession' }, { status: 400 })
  if (!dob) return NextResponse.json({ error: 'Please enter your date of birth' }, { status: 400 })
  if (!termsVersion) return NextResponse.json({ error: 'You must accept the Terms of Agreement' }, { status: 400 })

  const existing = await prisma.provider.findUnique({ where: { email }, select: { id: true } })
  if (existing) return NextResponse.json({ error: 'An account already exists for this email. Please sign in.' }, { status: 409 })

  const provider = await prisma.provider.create({
    data: {
      firstName: firstName.toUpperCase(),
      lastName: lastName.toUpperCase(),
      email,
      phone,
      profession,
      dob,
      passwordHash: await hashPassword(password),
      termsVersion,
      termsAcceptedAt: new Date(),
    },
    select: { id: true },
  })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, signSession(provider.id), cookieOptions)
  return res
}
