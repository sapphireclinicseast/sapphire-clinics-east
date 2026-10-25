// One enquiry: read the thread, reply, or change its status.
//
// Every handler re-checks the branch. Loading by id alone would let a
// front-desk account open the other branch's enquiry simply by knowing an id.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchForRole } from '@/lib/role-branch'
import { canUseInquiries } from '@/lib/inquiry-access'

export const dynamic = 'force-dynamic'

async function authorise(id: string) {
  const session = await auth()
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const user = session.user as { role?: string; name?: string | null; email?: string | null }
  if (!canUseInquiries(user.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  const forced = branchForRole(user.role ?? '')
  const inquiry = await prisma.inquiry.findUnique({ where: { id } })
  if (!inquiry) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  // 404 rather than 403: a branch account should not be able to learn that an
  // enquiry exists at the other branch.
  if (forced && inquiry.branch !== forced) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  return { inquiry, user }
}

/**
 * Is this enquirer already in the patient register?
 *
 * Front desk's first question about an enquiry is almost always "are they one
 * of ours?" — the answer changes the reply. Matched on email or phone first,
 * which are unambiguous, then on an exact full-name match as a fallback.
 *
 * A NAME match is reported as `confident: false`: names repeat, and a front
 * desk about to discuss a child's sessions should be told the match is a guess
 * rather than shown a record as if it were certain.
 */
async function findPatient(inq: { name: string; email: string | null; phone: string | null }) {
  const digits = (inq.phone ?? '').replace(/[^0-9]/g, '')
  const byContact = await prisma.patient.findFirst({
    where: {
      OR: [
        ...(inq.email ? [{ email: { equals: inq.email, mode: 'insensitive' as const } }] : []),
        // Last 10 digits: numbers are stored with and without the +63 prefix.
        ...(digits.length >= 10 ? [{ phone: { endsWith: digits.slice(-10) } }] : []),
      ],
    },
    select: { id: true, firstName: true, lastName: true, patientType: true, branches: true },
  })
  if (byContact) return { ...byContact, confident: true }

  const parts = inq.name.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return null
  const byName = await prisma.patient.findFirst({
    where: {
      firstName: { equals: parts[0], mode: 'insensitive' },
      lastName:  { equals: parts[parts.length - 1], mode: 'insensitive' },
    },
    select: { id: true, firstName: true, lastName: true, patientType: true, branches: true },
  })
  return byName ? { ...byName, confident: false } : null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authorise(id)
  if ('error' in a) return a.error

  // Opening it marks it read — that is what "read" means here, and it keeps
  // the badge honest without a separate click.
  if (!a.inquiry.readAt) {
    await prisma.inquiry.update({ where: { id }, data: { readAt: new Date() } })
  }
  const digits = (a.inquiry.phone ?? '').replace(/[^0-9]/g, '')
  const [messages, patient, history] = await Promise.all([
    prisma.inquiryMessage.findMany({ where: { inquiryId: id }, orderBy: { createdAt: 'asc' } }),
    findPatient(a.inquiry).catch(() => null),
    // Earlier conversations from the same person. A closed thread is not
    // reused, so without this the trail would end wherever somebody last
    // pressed "Mark done".
    (a.inquiry.email || digits.length >= 10)
      ? prisma.inquiry.findMany({
          where: {
            id: { not: id },
            branch: a.inquiry.branch,
            OR: [
              ...(a.inquiry.email ? [{ email: { equals: a.inquiry.email, mode: 'insensitive' as const } }] : []),
              ...(digits.length >= 10 ? [{ phone: { endsWith: digits.slice(-10) } }] : []),
            ],
          },
          orderBy: { lastMessageAt: 'desc' },
          take: 8,
          select: { id: true, ref: true, status: true, lastMessageAt: true },
        }).catch(() => [])
      : Promise.resolve([]),
  ])
  return NextResponse.json({
    inquiry: { ...a.inquiry, readAt: a.inquiry.readAt ?? new Date() },
    messages,
    patient,
    history,
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authorise(id)
  if ('error' in a) return a.error

  const body = await req.json().catch(() => ({}))
  const text = typeof body.message === 'string' ? body.message.trim().slice(0, 5000) : ''
  if (!text) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

  const author = a.user.name || a.user.email || 'Front Desk'
  await prisma.$transaction([
    prisma.inquiryMessage.create({
      data: { inquiryId: id, fromStaff: true, authorName: author, body: text },
    }),
    prisma.inquiry.update({
      where: { id },
      data: { status: 'ANSWERED', readAt: new Date(), lastMessageAt: new Date() },
    }),
  ])
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authorise(id)
  if ('error' in a) return a.error

  const body = await req.json().catch(() => ({}))
  const status = body.status
  if (!['OPEN', 'ANSWERED', 'CLOSED'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  await prisma.inquiry.update({ where: { id }, data: { status } })
  return NextResponse.json({ ok: true })
}
