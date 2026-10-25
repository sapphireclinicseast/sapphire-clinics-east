// POST /api/public/inquiry/resume — "email me the link to my past conversation".
//
// The response is deliberately the SAME whether or not a conversation exists.
// Telling the page "yes, that address has messaged Greenhills before" would let
// anyone confirm whether a person is in contact with the clinic simply by
// typing their address — the same reason a password reset never says whether an
// account was found. The email is the channel that proves who they are.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { emailInquiryLink } from '@/lib/inquiry-email'
import { preflight, withCors } from '../../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const body = await req.json().catch(() => ({}))
  const email = String(body.email ?? '').trim()
  const branch = String(body.branch ?? '').trim().toUpperCase()

  // Neutral acknowledgement, whatever happens below.
  const ok = () => withCors(NextResponse.json({
    ok: true,
    message: 'If we found a conversation for that address, we have emailed you a link to it.',
  }), origin)

  if (!email || !email.includes('@')) return ok()

  const inq = await prisma.inquiry.findFirst({
    where: {
      email: { equals: email, mode: 'insensitive' },
      ...(['SBEA', 'SBGH'].includes(branch) ? { branch } : {}),
    },
    orderBy: { lastMessageAt: 'desc' },
    select: { id: true },
  }).catch(() => null)

  // Awaited so a mail failure is logged before the response goes out, but the
  // helper never throws, so the answer stays the same either way.
  if (inq) await emailInquiryLink(inq.id, 'continued')
  return ok()
}
