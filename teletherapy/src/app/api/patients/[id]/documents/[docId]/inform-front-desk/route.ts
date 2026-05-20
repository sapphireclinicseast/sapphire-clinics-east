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

  // Authorization (relaxed for operational flagging):
  //   admin → always
  //   non-admin → must have access to the patient (active assignment
  //     or scheduled session) AND the document must not be locked.
  // Same rule the send-to-patient route uses. Previously this was
  // uploader-only to prevent Caitlynn flagging Eloisa's signed PR;
  // that gate matters less now because front-desk notification is
  // a routing action (queue this PR for billing) rather than a
  // claim of authorship. Uploader-only is still enforced on
  // re-upload/delete in the DELETE handler.
  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((doc as any).lockedAt) {
      return NextResponse.json(
        { error: 'This document is locked and cannot be modified.' },
        { status: 403 },
      )
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allowedStaffIds = (session.user as any).branches?.map((b: { staffId: string }) => b.staffId) ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staffPool = allowedStaffIds.length > 0 ? allowedStaffIds : [(session.user as any).staffId].filter(Boolean)
    const hasSession = staffPool.length > 0
      ? await prisma.schedule.findFirst({
          where: { patientId, staffId: { in: staffPool } },
          select: { id: true },
        })
      : null
    const hasActive = await prisma.patientAssignment.findFirst({
      where: { patientId, therapistAccountId: session.user.id, status: 'ACTIVE' },
      select: { id: true },
    })
    if (!hasSession && !hasActive) {
      return NextResponse.json(
        { error: 'You do not have access to this patient.' },
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
