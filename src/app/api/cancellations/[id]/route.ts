// DELETE /api/cancellations/[id] — soft-delete a cancellation log

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const reason = (body as { reason?: string }).reason ?? ''

  if (!reason.trim()) {
    return NextResponse.json({ error: 'A reason is required for deletion' }, { status: 400 })
  }

  const log = await prisma.cancellationLog.findUnique({
    where: { id },
    select: { id: true, type: true, patientId: true, deletedAt: true },
  })
  if (!log) return NextResponse.json({ error: 'Log not found' }, { status: 404 })
  if (log.deletedAt) return NextResponse.json({ error: 'Already deleted' }, { status: 400 })

  const isInvalid = log.type.endsWith('_INVALID')

  await prisma.$transaction([
    prisma.cancellationLog.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: session.user.name ?? session.user.email ?? 'Unknown',
        deletedById: session.user.id ?? null,
        deleteReason: reason.trim(),
      },
    }),
    // If it was an INVALID cancellation, decrement the patient's count
    ...(isInvalid
      ? [prisma.patient.update({
          where: { id: log.patientId },
          data: { cancellationsUsed: { decrement: 1 } },
        })]
      : []),
  ])

  return NextResponse.json({ ok: true })
}
