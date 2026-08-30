import { NextRequest, NextResponse } from 'next/server'
import { CLINIC_COOKIE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/clinic/login', req.nextUrl.origin), 303)
  res.cookies.set(CLINIC_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
