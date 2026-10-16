// Clears the durable HttpOnly patient-session cookie on sign-out.
// (localStorage is cleared separately on the client.)

import { NextResponse } from 'next/server'

const COOKIE = 'scei_pt'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
