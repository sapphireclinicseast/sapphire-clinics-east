import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  // 303 → the browser follows with GET to the login page.
  const res = NextResponse.redirect(new URL('/provider/login', req.nextUrl.origin), 303)
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
