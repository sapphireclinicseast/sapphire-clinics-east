import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Mark a Progress Report as "informed to front desk"
// This makes it appear in the marketing-hub front desk dashboard widget.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: patientId, docId } = await params

  // @ts-ignore
  const doc = await prisma.patientDocument.findUnique({ where: { id: docId } })
  if (!doc || doc.patientId !== patientId) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (doc.documentType !== 'PROGRESS_REPORT') {
    return NextResponse.json(
      { error: 'Only Progress Reports can be flagged for front desk' },
      { status: 400 }
    )
  }

  // Authorization: admin OR (the original uploader AND active owner
  // AND the document is not locked). Same rule as DELETE so a
  // non-uploader (e.g. Caitlynn looking at Eloisa's PR) can't flag
  // somebody else's signed PR for billing.
  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin) {
    if (doc.uploadedById !== session.user.id) {
      return NextResponse.json(
        { error: 'Only the original uploader can flag this PR.' },
        { status: 403 },
      )
    }
    const active = await prisma.patientAssignment.findFirst({
      where: { patientId, therapistAccountId: session.user.id, status: 'ACTIVE' },
      select: { id: true },
    })
    if (!active) {
      return NextResponse.json(
        { error: 'You no longer have active access to this patient.' },
        { status: 403 },
      )
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((doc as any).lockedAt) {
      return NextResponse.json(
        { error: 'This document is locked and cannot be modified.' },
        { status: 403 },
      )
    }
  }

  // @ts-ignore
  const updated = await prisma.patientDocument.update({
    where: { id: docId },
    data: {
      informedFrontDeskAt: new Date(),
      informedById: session.user.id,
    },
  })

  return NextResponse.json({
    success: true,
    informedAt: updated.informedFrontDeskAt,
  })
}
