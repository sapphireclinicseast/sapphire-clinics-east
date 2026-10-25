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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await authorise(id)
  if ('error' in a) return a.error

  // Opening it marks it read — that is what "read" means here, and it keeps
  // the badge honest without a separate click.
  if (!a.inquiry.readAt) {
    await prisma.inquiry.update({ where: { id }, data: { readAt: new Date() } })
  }
  const messages = await prisma.inquiryMessage.findMany({
    where: { inquiryId: id }, orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ inquiry: { ...a.inquiry, readAt: a.inquiry.readAt ?? new Date() }, messages })
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
