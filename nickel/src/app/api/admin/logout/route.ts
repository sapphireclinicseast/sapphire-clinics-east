import { NextResponse } from 'next/server'
import { ADMIN_COOKIE } from '@/lib/auth'

export async function POST() {
  const res = NextResponse.redirect(new URL('/admin/login', process.env.NEXTAUTH_URL || 'https://nickelcare.com'), 303)
  res.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
