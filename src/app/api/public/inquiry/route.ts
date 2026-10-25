// POST /api/public/inquiry — a member of the public asks a branch a question.
//
// Unauthenticated by design: this replaces enquiries arriving through Meta
// messaging, so putting a login in front of it would defeat the purpose.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createInquiryWithRef } from '@/lib/inquiry-ref'
import { emailInquiryLink } from '@/lib/inquiry-email'
import { preflight, withCors } from '../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

const MAX = { name: 120, email: 200, phone: 40, subject: 200, body: 5000 }

function clean(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const b = await req.json()
    const name    = clean(b.name, MAX.name)
    const email   = clean(b.email, MAX.email)
    const phone   = clean(b.phone, MAX.phone)
    const subject = clean(b.subject, MAX.subject)
    const body    = clean(b.message ?? b.body, MAX.body)
    const branch  = clean(b.branch, 16).toUpperCase()

    if (!name || !body || !branch) {
      return withCors(NextResponse.json(
        { error: 'Name, branch and message are required.' }, { status: 400 }), origin)
    }
    // A way to reach them back matters more than which one they give.
    if (!email && !phone) {
      return withCors(NextResponse.json(
        { error: 'Please leave an email address or a phone number so we can reply.' },
        { status: 400 }), origin)
    }

    // The branch must be one that actually has a front desk to receive this.
    // Trusting the posted value would let an enquiry land in a branch nobody
    // watches, which is the failure mode this whole feature exists to end.
    const allowed = await prisma.hrBranch.findFirst({
      where: { shortCode: branch, active: true },
      select: { shortCode: true },
    })
    if (!allowed || !['SBEA', 'SBGH'].includes(allowed.shortCode)) {
      return withCors(NextResponse.json(
        { error: 'Please choose a branch from the list.' }, { status: 400 }), origin)
    }

    const before = await prisma.inquiry.count({ where: { branch: allowed.shortCode } })
    const inquiry = await createInquiryWithRef({
      branch: allowed.shortCode, name, email, phone, subject, body,
    })
    // Count tells us whether this opened a thread or joined one; the wording
    // differs, and "joined one" is the case where they may no longer have the
    // link. Fire-and-forget: the enquiry is already saved and must not fail
    // because email did.
    const after = await prisma.inquiry.count({ where: { branch: allowed.shortCode } })
    void emailInquiryLink(inquiry.id, after > before ? 'new' : 'continued')

    // The token is returned once, here. It is the enquirer's only key to the
    // thread, so the page must show it as a link they can keep.
    return withCors(NextResponse.json({
      ok: true, ref: inquiry.ref, token: inquiry.token,
    }), origin)
  } catch (err) {
    console.error('[public/inquiry] failed:', err)
    return withCors(NextResponse.json(
      { error: 'Could not submit your enquiry. Please try again.' }, { status: 500 }), origin)
  }
}
