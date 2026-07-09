// POST /api/public/ugat/auth/sign-in
// Body: { username, password }
// Resolves, in order: the virtual MAIN admin (`main` / `scei`), a STAFF_ADMIN
// (UgatAdmin row), then a SCHOLAR (UgatScholar). Scholars must be verified and
// not disabled. Response: { token, role, scholar? }

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken, comparePassword, isMainAdminCredentials, UGAT_MAIN_ADMIN_USERNAME } from '@/lib/ugat-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: { username?: string; email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  // Accept `username` (with `email` as a legacy fallback).
  const identifier = (body.username || body.email || '').trim().toLowerCase()
  const password = body.password || ''
  if (!identifier || !password) {
    return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 })
  }

  // ── MAIN admin (virtual) ────────────────────────────────────────────
  if (isMainAdminCredentials(identifier, password)) {
    const token = await signToken({ role: 'MAIN_ADMIN', username: UGAT_MAIN_ADMIN_USERNAME, name: 'Main Administrator' })
    return NextResponse.json({ token, role: 'MAIN_ADMIN' })
  }

  // ── STAFF admin (UgatAdmin row) ─────────────────────────────────────
  const admin = await prisma.ugatAdmin.findUnique({ where: { username: identifier } })
  if (admin) {
    if (!(await comparePassword(password, admin.passwordHash))) {
      return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 })
    }
    if (admin.disabledAt) {
      return NextResponse.json({ error: 'This admin account has been disabled.' }, { status: 403 })
    }
    const token = await signToken({ role: 'STAFF_ADMIN', adminId: admin.id, username: admin.username, name: admin.name })
    return NextResponse.json({ token, role: 'STAFF_ADMIN' })
  }

  // ── Scholar (by username) ───────────────────────────────────────────
  const scholar = await prisma.ugatScholar.findUnique({ where: { username: identifier } })
  // Uniform failure message to avoid leaking which usernames are registered.
  const invalid = () => NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 })
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
    email: scholar.personalEmail,
    firstName: scholar.firstName,
  })
  return NextResponse.json({
    token,
    role: 'SCHOLAR',
    scholar: {
      id: scholar.id,
      username: scholar.username,
      professionalEmail: scholar.professionalEmail,
      personalEmail: scholar.personalEmail,
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
