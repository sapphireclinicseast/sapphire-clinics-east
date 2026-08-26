// GET /api/availability/staff/[staffId] — a staff member's published
// availability, shown to someone booking a 1-on-1 with them.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: Promise<{ staffId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { staffId } = await params
  const slots = await prisma.availabilitySlot.findMany({
    where: { staffId },
    orderBy: [{ dayFrom: 'asc' }, { timeStart: 'asc' }],
  })
  return NextResponse.json({ slots })
}
