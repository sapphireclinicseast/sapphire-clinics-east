import { NextRequest, NextResponse } from 'next/server'
import { DOCTOR_COOKIE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/doctor/login', req.nextUrl.origin), 303)
  res.cookies.set(DOCTOR_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
