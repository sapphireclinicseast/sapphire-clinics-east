import { NextRequest, NextResponse } from 'next/server'
import { adminPassword, adminEmail, signAdminSession, ADMIN_COOKIE, cookieOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { email?: string; password?: string }
  const email = String(b.email ?? '').toLowerCase().trim()
  const pw = String(b.password ?? '')
  const expected = adminPassword()
  if (!expected) return NextResponse.json({ error: 'Admin access is not configured.' }, { status: 503 })
  if (email !== adminEmail() || pw !== expected) return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, signAdminSession(), cookieOptions)
  return res
}
