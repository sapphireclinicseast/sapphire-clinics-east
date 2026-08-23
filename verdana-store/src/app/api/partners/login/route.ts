import { NextResponse } from 'next/server'
import { readPartners, findByUsername, verifyPassword, signSession, publicPartner, PARTNER_COOKIE } from '@/lib/partners'

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json()
    const partners = await readPartners()
    const p = findByUsername(partners, String(username || ''))
    if (!p || !verifyPassword(String(password || ''), p.passwordHash)) {
      return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 })
    }
    const res = NextResponse.json({ ok: true, partner: publicPartner(p) })
    res.cookies.set(PARTNER_COOKIE, signSession(p.id), {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 30 * 86400,
    })
    return res
  } catch (e) {
    console.error('Partner login error:', e)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
