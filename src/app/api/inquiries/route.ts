// Staff inbox listing. Branch scoping is applied HERE, not in the client:
// a branch filter the browser sends is a request, not a permission, and a
// front-desk account can call this route directly.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchForRole } from '@/lib/role-branch'
import { canUseInquiries } from '@/lib/inquiry-access'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string }).role ?? ''
  // Enquiries carry a member of the public's name, contact details and their
  // message. Signed-in is not the bar.
  if (!canUseInquiries(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const forced = branchForRole(role)          // null = sees every branch

  const { searchParams } = new URL(req.url)
  const wanted = searchParams.get('branch')
  const status = searchParams.get('status')
  const q      = (searchParams.get('q') || '').trim()

  // A branch-scoped account is pinned to its own branch whatever it asks for.
  const branch = forced ?? (wanted && wanted !== 'ALL' ? wanted : undefined)

  const inquiries = await prisma.inquiry.findMany({
    where: {
      ...(branch ? { branch } : {}),
      ...(status && status !== 'ALL' ? { status: status as 'OPEN' | 'ANSWERED' | 'CLOSED' } : {}),
      ...(q ? {
        OR: [
          { ref:     { contains: q, mode: 'insensitive' } },
          { name:    { contains: q, mode: 'insensitive' } },
          { email:   { contains: q, mode: 'insensitive' } },
          { phone:   { contains: q, mode: 'insensitive' } },
          { subject: { contains: q, mode: 'insensitive' } },
        ],
      } : {}),
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 300,
    select: {
      id: true, ref: true, branch: true, name: true, email: true, phone: true,
      subject: true, status: true, readAt: true, lastMessageAt: true, createdAt: true,
      _count: { select: { messages: true } },
      // Newest message, for the preview line in the conversation list. A list
      // of names with no idea what was said is not a conversation list.
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { body: true, fromStaff: true, createdAt: true },
      },
    },
  })

  // Unread is counted over the same scope the list uses, so the badge and the
  // list can never disagree.
  const unread = await prisma.inquiry.count({
    where: { ...(branch ? { branch } : {}), readAt: null, status: { not: 'CLOSED' } },
  })

  // Flatten the one-message array into a preview so the client does not have
  // to know it asked for a list to get a single row.
  const shaped = inquiries.map(({ messages, ...rest }) => ({
    ...rest,
    preview: messages[0]
      ? { body: messages[0].body, fromStaff: messages[0].fromStaff }
      : null,
  }))

  return NextResponse.json({ inquiries: shaped, unread, scopedToBranch: forced })
}
