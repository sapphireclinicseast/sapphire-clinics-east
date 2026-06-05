// Aurora admin console auth. POST to log in (password → httpOnly cookie),
// DELETE to log out, GET to check the current session.

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, adminSessionValue, isAdmin, passwordMatches } from '@/lib/admin-auth'

const MAX_AGE = 60 * 60 * 8 // 8 hours

export async function GET(req: NextRequest) {
  return NextResponse.json({ authed: isAdmin(req) })
}

export async function POST(req: NextRequest) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string }
  const session = adminSessionValue()

  if (!session) {
    return NextResponse.json(
      { error: 'Admin console is not configured on the server.' },
      { status: 503 },
    )
  }
  if (!password || !passwordMatches(password)) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
