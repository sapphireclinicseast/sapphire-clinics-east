// POST /api/public/class-portal/auth/sign-in
// Body: { role: 'ADMIN'|'TEACHER'|'STUDENT', email, password }
// Response: { token, user: { id?, role, email, firstName?, lastName?, level? } }

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  signToken,
  comparePassword,
  isAdminCredentials,
  isFrontdeskCredentials,
  CLASS_PORTAL_ADMIN_EMAIL,
  CLASS_PORTAL_FRONTDESK_EMAIL,
  type ClassPortalRole,
} from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  let body: { role?: string; email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return withCors(NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }), origin)
  }
  const { role, email, password } = body
  if (!role || !email || !password) {
    return withCors(NextResponse.json({ error: 'role, email, and password are required.' }, { status: 400 }), origin)
  }
  if (role !== 'ADMIN' && role !== 'TEACHER' && role !== 'STUDENT' && role !== 'FRONTDESK') {
    return withCors(NextResponse.json({ error: 'Invalid role.' }, { status: 400 }), origin)
  }

  // Admin: virtual user, hardcoded creds.
  if (role === 'ADMIN') {
    if (!isAdminCredentials(email, password)) {
      return withCors(NextResponse.json({ error: 'Invalid admin credentials.' }, { status: 401 }), origin)
    }
    const token = await signToken({ role: 'ADMIN', email: CLASS_PORTAL_ADMIN_EMAIL })
    return withCors(NextResponse.json({
      token,
      user: { role: 'ADMIN' as ClassPortalRole, email: CLASS_PORTAL_ADMIN_EMAIL },
    }), origin)
  }

  // Frontdesk: virtual user, hardcoded creds.
  if (role === 'FRONTDESK') {
    if (!isFrontdeskCredentials(email, password)) {
      return withCors(NextResponse.json({ error: 'Invalid front desk credentials.' }, { status: 401 }), origin)
    }
    const token = await signToken({ role: 'FRONTDESK', email: CLASS_PORTAL_FRONTDESK_EMAIL })
    return withCors(NextResponse.json({
      token,
      user: { role: 'FRONTDESK' as ClassPortalRole, email: CLASS_PORTAL_FRONTDESK_EMAIL },
    }), origin)
  }

  // Teacher / Student: DB lookup + bcrypt verify.
  const dbRole = role === 'TEACHER' ? 'TEACHER' : 'STUDENT'
  const user = await prisma.classPortalUser.findUnique({
    where: { role_email: { role: dbRole, email: email.trim().toLowerCase() } },
  })
  if (!user || !(await comparePassword(password, user.passwordHash))) {
    return withCors(NextResponse.json({ error: 'Email and password do not match a ' + role.toLowerCase() + ' account.' }, { status: 401 }), origin)
  }
  const token = await signToken({
    role: dbRole,
    userId: user.id,
    email: user.email,
    firstName: user.firstName ?? undefined,
  })
  return withCors(NextResponse.json({
    token,
    user: {
      id: user.id,
      role: dbRole,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      level: user.level,
    },
  }), origin)
}
