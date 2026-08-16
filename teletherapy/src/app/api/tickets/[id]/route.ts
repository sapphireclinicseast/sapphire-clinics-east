import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/tickets/[id] — main admin records a resolution and marks the
// ticket resolved. The raiser sees the resolution on their side.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const resolution = ((body.resolution as string) ?? '').trim()
  const reopen = body.status === 'OPEN'

  if (!reopen && !resolution) {
    return NextResponse.json({ error: 'Resolution is required' }, { status: 400 })
  }

  const ticket = await prisma.ticket.update({
    where: { id },
    data: reopen
      ? { status: 'OPEN' }
      : {
          resolution,
          status: 'RESOLVED',
          resolvedByName: session.user.name ?? 'Main admin',
          resolvedAt: new Date(),
        },
  })

  return NextResponse.json({ ticket })
}
