import { NextResponse } from 'next/server'
import { PARTNER_COOKIE } from '@/lib/partners'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(PARTNER_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
