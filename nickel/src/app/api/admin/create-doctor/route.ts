import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAdmin, hashPassword } from '@/lib/auth'

// Superadmin creates an already-verified rehab doctor account.
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const firstName = String(b.firstName ?? '').trim()
  const lastName = String(b.lastName ?? '').trim()
  const email = String(b.email ?? '').toLowerCase().trim()
  const password = String(b.password ?? '')
  const phone = String(b.phone ?? '').trim() || null
  const prcNumber = String(b.prcNumber ?? '').trim() || null
  const postNominals = String(b.postNominals ?? '').trim() || null
  const specialization = String(b.specialization ?? '').trim() || 'Rehabilitation Medicine (Physiatry)'
  const feeNum = Number(b.consultFee)
  const consultFee = Number.isFinite(feeNum) && feeNum > 0 ? feeNum : null

  if (!firstName || !lastName || !email) return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
  if (!email.includes('@')) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

  const existing = await prisma.doctor.findUnique({ where: { email }, select: { id: true } })
  if (existing) return NextResponse.json({ error: 'A doctor already exists for this email.' }, { status: 409 })

  const doctor = await prisma.doctor.create({
    data: {
      firstName: firstName.toUpperCase(),
      lastName: lastName.toUpperCase(),
      email, phone, prcNumber, postNominals, specialization,
      consultFee,
      passwordHash: await hashPassword(password),
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      active: true,
    },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, id: doctor.id })
}
