// DELETE /api/availability/[id] — remove one of my availability slots.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const acc = session.user as unknown as { id: string; role?: string }
  const { id } = await params

  const slot = await prisma.availabilitySlot.findUnique({ where: { id }, select: { accountId: true } })
  if (!slot) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (slot.accountId !== acc.id && acc.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  await prisma.availabilitySlot.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
