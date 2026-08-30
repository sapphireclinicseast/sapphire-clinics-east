import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword, signDoctorSession, DOCTOR_COOKIE, cookieOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { email?: string; password?: string }
  const email = String(b.email ?? '').toLowerCase().trim()
  const password = String(b.password ?? '')
  if (!email || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })

  const doctor = await prisma.doctor.findUnique({ where: { email } })
  if (!doctor || !doctor.active) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  if (!(await verifyPassword(password, doctor.passwordHash))) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(DOCTOR_COOKIE, signDoctorSession(doctor.id), cookieOptions)
  return res
}
