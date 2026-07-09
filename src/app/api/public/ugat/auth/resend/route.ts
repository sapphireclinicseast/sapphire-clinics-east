// POST /api/public/ugat/auth/resend
// Body: { email }
// Re-issues a verification link for an unverified account. Always returns ok
// (no account-enumeration) unless the email is malformed.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { randomToken } from '@/lib/ugat-auth'
import { sendUgatVerificationEmail } from '@/lib/ugat-email'

export const dynamic = 'force-dynamic'

const PUBLIC_URL = process.env.UGAT_PUBLIC_URL || 'https://scholarship.sapphireclinicseast.org'

export async function POST(req: Request) {
  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const email = (body.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const scholar = await prisma.ugatScholar.findUnique({
    where: { email },
    select: { id: true, firstName: true, emailVerifiedAt: true, disabledAt: true },
  })

  // Only send for existing, unverified, enabled accounts — but respond ok
  // either way so callers can't probe which emails exist.
  if (scholar && !scholar.emailVerifiedAt && !scholar.disabledAt) {
    const token = randomToken()
    await prisma.ugatVerificationToken.create({
      data: { scholarId: scholar.id, token, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) },
    })
    const verifyUrl = `${PUBLIC_URL}/api/public/ugat/auth/verify?token=${encodeURIComponent(token)}`
    try {
      await sendUgatVerificationEmail({ to: email, firstName: scholar.firstName, verifyUrl })
    } catch (e) {
      console.error('[ugat] resend verification failed:', e)
    }
  }

  return NextResponse.json({ ok: true })
}
