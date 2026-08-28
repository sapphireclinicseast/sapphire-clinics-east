import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, signPatientSession, PATIENT_COOKIE, cookieOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const firstName = String(b.firstName ?? '').trim()
  const lastName = String(b.lastName ?? '').trim()
  const email = String(b.email ?? '').toLowerCase().trim()
  const password = String(b.password ?? '')
  const phone = String(b.phone ?? '').trim() || null
  const address = String(b.address ?? '').trim() || null
  const city = String(b.city ?? '').trim() || null

  if (!firstName || !lastName || !email) return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
  if (!email.includes('@')) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

  const existing = await prisma.patient.findUnique({ where: { email }, select: { id: true } })
  if (existing) return NextResponse.json({ error: 'An account already exists for this email. Please sign in.' }, { status: 409 })

  const patient = await prisma.patient.create({
    data: { firstName: firstName.toUpperCase(), lastName: lastName.toUpperCase(), email, phone, address, city, passwordHash: await hashPassword(password) },
    select: { id: true },
  })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(PATIENT_COOKIE, signPatientSession(patient.id), cookieOptions)
  return res
}
