// Staff inbox listing. Branch scoping is applied HERE, not in the client:
// a branch filter the browser sends is a request, not a permission, and a
// front-desk account can call this route directly.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchForRole } from '@/lib/role-branch'
import { canUseInquiries } from '@/lib/inquiry-access'
import { readMarksFor, countUnreadFor, isUnreadFor } from '@/lib/inquiry-read'

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

  // Read state belongs to the account asking, not to the thread: see
  // lib/inquiry-read.ts. Unread is counted over the same scope the list uses,
  // so the badge and the list can never disagree.
  const userId = (session.user as { id?: string }).id ?? ''
  const [readMap, unread] = await Promise.all([
    readMarksFor(userId, inquiries.map(i => i.id)),
    countUnreadFor(userId, branch),
  ])

  // Flatten the one-message array into a preview so the client does not have
  // to know it asked for a list to get a single row.
  //
  // `readAt` is deliberately rewritten to mean "read by YOU". Both clients
  // already draw the bold row and the red dot from it, so making it per-viewer
  // here fixes them both without either needing to know the rule — and it keeps
  // every row's dot agreeing with the badge beside it. The thread's own
  // first-opened timestamp stays in the column of the same name in the
  // database; nothing in the UI wanted it.
  const shaped = inquiries.map(({ messages, ...rest }) => ({
    ...rest,
    readAt: isUnreadFor(rest, readMap)
      ? null
      : (readMap.get(rest.id) ?? rest.readAt ?? rest.lastMessageAt),
    preview: messages[0]
      ? { body: messages[0].body, fromStaff: messages[0].fromStaff }
      : null,
  }))

  return NextResponse.json({ inquiries: shaped, unread, scopedToBranch: forced })
}
