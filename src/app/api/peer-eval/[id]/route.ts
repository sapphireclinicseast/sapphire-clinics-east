import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN'].includes(role))
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { status, notes } = body

  const assignment = await prisma.peerEvalAssignment.update({
    where: { id },
    data: {
      ...(status ? { status, completedAt: status === 'COMPLETED' ? new Date() : undefined } : {}),
      ...(notes !== undefined ? { notes } : {}),
    },
  })
  return NextResponse.json(assignment)
}
