import { NextRequest, NextResponse } from 'next/server'
import { PATIENT_COOKIE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/', req.nextUrl.origin), 303)
  res.cookies.set(PATIENT_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
