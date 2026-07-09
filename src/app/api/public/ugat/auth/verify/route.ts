// GET /api/public/ugat/auth/verify?token=...
// The link emailed to scholars on signup. Marks the account verified and
// redirects back to the landing page with a status flag.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const PUBLIC_URL = process.env.UGAT_PUBLIC_URL || 'https://scholarship.sapphireclinicseast.org'

function redirect(status: 'verified' | 'expired' | 'invalid' | 'already') {
  const url = `${PUBLIC_URL}/ugatfellow?${status === 'verified' || status === 'already' ? 'verified=1' : `verify_error=${status}`}`
  return NextResponse.redirect(url, 302)
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') || ''
  if (!token) return redirect('invalid')

  const row = await prisma.ugatVerificationToken.findUnique({
    where: { token },
    include: { scholar: { select: { id: true, emailVerifiedAt: true } } },
  })
  if (!row) return redirect('invalid')

  // Already verified (token consumed or account flagged) → friendly success.
  if (row.consumedAt || row.scholar.emailVerifiedAt) return redirect('already')

  if (row.expiresAt.getTime() < Date.now()) return redirect('expired')

  await prisma.$transaction([
    prisma.ugatScholar.update({
      where: { id: row.scholarId },
      data: { emailVerifiedAt: new Date() },
    }),
    prisma.ugatVerificationToken.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    }),
  ])

  return redirect('verified')
}
