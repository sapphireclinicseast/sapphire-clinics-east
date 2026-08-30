import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionClinic, hashPassword } from '@/lib/auth'

// A verified clinic creates an account for one of its existing patients.
export async function POST(req: NextRequest) {
  const clinic = await getSessionClinic()
  if (!clinic) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (clinic.verificationStatus !== 'VERIFIED') return NextResponse.json({ error: 'Your clinic must be verified first.' }, { status: 403 })

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const firstName = String(b.firstName ?? '').trim()
  const lastName = String(b.lastName ?? '').trim()
  const email = String(b.email ?? '').toLowerCase().trim()
  const password = String(b.password ?? '')
  if (!firstName || !lastName || !email || !email.includes('@')) return NextResponse.json({ error: 'Name and a valid email are required' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Set a password of at least 8 characters for the patient' }, { status: 400 })

  const existing = await prisma.patient.findUnique({ where: { email }, select: { id: true } })
  if (existing) return NextResponse.json({ error: 'A patient with this email already exists.' }, { status: 409 })

  const patient = await prisma.patient.create({
    data: {
      firstName, lastName, email,
      passwordHash: await hashPassword(password),
      phone: String(b.phone ?? '').trim() || null,
      address: String(b.address ?? '').trim() || null,
      city: String(b.city ?? '').trim() || clinic.city || null,
      dob: typeof b.dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.dob) ? new Date(`${b.dob}T00:00:00.000Z`) : null,
      clinicId: clinic.id,
    },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, id: patient.id })
}
