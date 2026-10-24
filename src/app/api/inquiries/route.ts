// Staff inbox listing. Branch scoping is applied HERE, not in the client:
// a branch filter the browser sends is a request, not a permission, and a
// front-desk account can call this route directly.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchForRole } from '@/lib/role-branch'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string }).role ?? ''
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
    },
  })

  // Unread is counted over the same scope the list uses, so the badge and the
  // list can never disagree.
  const unread = await prisma.inquiry.count({
    where: { ...(branch ? { branch } : {}), readAt: null, status: { not: 'CLOSED' } },
  })

  return NextResponse.json({ inquiries, unread, scopedToBranch: forced })
}
