import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionClinic, hashPassword } from '@/lib/auth'

const PROFESSIONS = new Set(['PT', 'OT', 'SLP', 'SPED', 'PSYCHOLOGY', 'MD', 'ORTHOSIS'])

// A verified clinic creates an account for one of its existing therapists.
export async function POST(req: NextRequest) {
  const clinic = await getSessionClinic()
  if (!clinic) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (clinic.verificationStatus !== 'VERIFIED') return NextResponse.json({ error: 'Your clinic must be verified first.' }, { status: 403 })

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const firstName = String(b.firstName ?? '').trim()
  const lastName = String(b.lastName ?? '').trim()
  const email = String(b.email ?? '').toLowerCase().trim()
  const password = String(b.password ?? '')
  const profession = String(b.profession ?? 'PT').toUpperCase()
  if (!firstName || !lastName || !email || !email.includes('@')) return NextResponse.json({ error: 'Name and a valid email are required' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Set a password of at least 8 characters for the therapist' }, { status: 400 })
  if (!PROFESSIONS.has(profession)) return NextResponse.json({ error: 'Choose a valid profession' }, { status: 400 })

  const existing = await prisma.provider.findUnique({ where: { email }, select: { id: true } })
  if (existing) return NextResponse.json({ error: 'A therapist with this email already exists.' }, { status: 409 })

  // Clinic-onboarded therapists still go through SCEI verification before they're
  // bookable on the public marketplace, but the clinic can arrange visits for them.
  const provider = await prisma.provider.create({
    data: {
      firstName: firstName.toUpperCase(), lastName: lastName.toUpperCase(), email,
      passwordHash: await hashPassword(password),
      phone: String(b.phone ?? '').trim() || null,
      profession, clinicId: clinic.id,
      citiesCovered: clinic.city ? [clinic.city] : [],
      rate: b.rate ? Number(b.rate) : null,
      verificationStatus: 'PENDING',
    },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, id: provider.id })
}
