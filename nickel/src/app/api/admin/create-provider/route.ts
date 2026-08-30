import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAdmin, hashPassword } from '@/lib/auth'

const PROFESSIONS = new Set(['PT', 'OT', 'SLP', 'SPED', 'PSYCHOLOGY', 'MD', 'ORTHOSIS'])

// Superadmin creates an already-verified therapist (PT) account.
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const firstName = String(b.firstName ?? '').trim()
  const lastName = String(b.lastName ?? '').trim()
  const email = String(b.email ?? '').toLowerCase().trim()
  const password = String(b.password ?? '')
  const phone = String(b.phone ?? '').trim() || null
  const profession = String(b.profession ?? 'PT').toUpperCase()
  const prcNumber = String(b.prcNumber ?? '').trim() || null
  const postNominals = String(b.postNominals ?? '').trim() || null
  const dobStr = String(b.dob ?? '').trim()
  const dob = /^\d{4}-\d{2}-\d{2}$/.test(dobStr) ? new Date(`${dobStr}T00:00:00.000Z`) : null

  if (!firstName || !lastName || !email) return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
  if (!email.includes('@')) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  if (!PROFESSIONS.has(profession)) return NextResponse.json({ error: 'Invalid profession' }, { status: 400 })

  const existing = await prisma.provider.findUnique({ where: { email }, select: { id: true } })
  if (existing) return NextResponse.json({ error: 'A provider already exists for this email.' }, { status: 409 })

  const provider = await prisma.provider.create({
    data: {
      firstName: firstName.toUpperCase(),
      lastName: lastName.toUpperCase(),
      email, phone, profession, dob, prcNumber, postNominals,
      passwordHash: await hashPassword(password),
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      reviewerNote: 'Created & verified by superadmin.',
      active: true,
    },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, id: provider.id })
}
