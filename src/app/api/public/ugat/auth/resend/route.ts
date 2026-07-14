// POST /api/public/ugat/auth/resend
// Body: { username }
// Re-issues a verification link (to both the professional + personal email)
// for an unverified account. Always returns ok (no account-enumeration).

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { randomToken } from '@/lib/ugat-auth'
import { sendUgatVerificationEmail } from '@/lib/ugat-email'

export const dynamic = 'force-dynamic'

const ORIGIN = new URL(process.env.UGAT_APP_URL || 'https://fellowship.sapphireclinicseast.org').origin

export async function POST(req: Request) {
  let body: { username?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const username = (body.username || '').trim().toLowerCase()
  if (!username) {
    return NextResponse.json({ error: 'Please enter your username.' }, { status: 400 })
  }

  const scholar = await prisma.ugatScholar.findUnique({
    where: { username },
    select: { id: true, firstName: true, professionalEmail: true, personalEmail: true, emailVerifiedAt: true, disabledAt: true },
  })

  // Only send for existing, unverified, enabled accounts — but respond ok
  // either way so callers can't probe which usernames exist.
  if (scholar && !scholar.emailVerifiedAt && !scholar.disabledAt) {
    const token = randomToken()
    await prisma.ugatVerificationToken.create({
      data: { scholarId: scholar.id, token, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) },
    })
    const recipients = [...new Set([scholar.professionalEmail, scholar.personalEmail])]
    const verifyUrl = `${ORIGIN}/api/public/ugat/auth/verify?token=${encodeURIComponent(token)}`
    try {
      await sendUgatVerificationEmail({ to: recipients, firstName: scholar.firstName, verifyUrl })
    } catch (e) {
      console.error('[ugat] resend verification failed:', e)
    }
  }

  return NextResponse.json({ ok: true })
}
