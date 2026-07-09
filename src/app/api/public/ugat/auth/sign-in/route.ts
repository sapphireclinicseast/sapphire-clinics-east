// POST /api/public/ugat/auth/sign-in
// Body: { email, password }
// Handles BOTH the virtual admin login (main@ SCEI → gates /ugatfellow/admin)
// and scholar logins. Scholars must have a verified email and not be disabled.
// Response: { token, role, scholar? }

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken, comparePassword, isAdminCredentials, UGAT_ADMIN_EMAIL } from '@/lib/ugat-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  // ── Admin (virtual) ────────────────────────────────────────────────
  if (isAdminCredentials(email, password)) {
    const token = await signToken({ role: 'ADMIN', email: UGAT_ADMIN_EMAIL })
    return NextResponse.json({ token, role: 'ADMIN' })
  }

  // ── Scholar ────────────────────────────────────────────────────────
  const scholar = await prisma.ugatScholar.findUnique({ where: { email } })
  // Uniform failure message to avoid leaking which emails are registered.
  const invalid = () => NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 })
  if (!scholar) return invalid()
  if (!(await comparePassword(password, scholar.passwordHash))) return invalid()

  if (scholar.disabledAt) {
    return NextResponse.json({ error: 'This account has been disabled. Please contact scholarship@sapphireclinicseast.org.' }, { status: 403 })
  }
  if (!scholar.emailVerifiedAt) {
    return NextResponse.json(
      { error: 'Please verify your email first. Check your inbox, or use "Resend link" below.', needsVerification: true },
      { status: 403 },
    )
  }

  const token = await signToken({
    role: 'SCHOLAR',
    scholarId: scholar.id,
    email: scholar.email,
    firstName: scholar.firstName,
  })
  return NextResponse.json({
    token,
    role: 'SCHOLAR',
    scholar: {
      id: scholar.id,
      email: scholar.email,
      firstName: scholar.firstName,
      middleName: scholar.middleName,
      lastName: scholar.lastName,
      school: scholar.school,
      program: scholar.program,
      preferredField: scholar.preferredField,
      expectedGraduationYear: scholar.expectedGraduationYear,
    },
  })
}
