import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, signClinicSession, CLINIC_COOKIE, cookieOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const name = String(b.name ?? '').trim()
  const email = String(b.email ?? '').toLowerCase().trim()
  const password = String(b.password ?? '')
  const contactPerson = String(b.contactPerson ?? '').trim() || null
  const phone = String(b.phone ?? '').trim() || null

  if (!name || !email) return NextResponse.json({ error: 'Business name and email are required' }, { status: 400 })
  if (!email.includes('@')) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

  const existing = await prisma.clinic.findUnique({ where: { email }, select: { id: true } })
  if (existing) return NextResponse.json({ error: 'An account already exists for this email. Please sign in.' }, { status: 409 })

  const clinic = await prisma.clinic.create({
    data: { name, email, contactPerson, phone, passwordHash: await hashPassword(password), verificationStatus: 'UNVERIFIED' },
    select: { id: true },
  })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(CLINIC_COOKIE, signClinicSession(clinic.id), cookieOptions)
  return res
}
