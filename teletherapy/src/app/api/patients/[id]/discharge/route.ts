import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: patientId } = await params
  const { remarks } = await req.json()

  if (!remarks?.trim()) {
    return NextResponse.json({ error: 'Discharge remarks are required' }, { status: 400 })
  }

  // New model: at most one row per (patient, therapist). Flip the
  // current row to DISCHARGED in place — same key whether it was
  // ACTIVE, DEACTIVATED, or didn't exist yet.
  // Discharge also permanently freezes the discharger's notes for
  // this patient (same rule as endorsement): once you stop being the
  // active owner, your historical notes become read-only forever.
  const lockStamp = new Date()
  await prisma.$transaction([
    prisma.patientAssignment.upsert({
      where: {
        patientId_therapistAccountId: {
          patientId,
          therapistAccountId: session.user.id,
        },
      },
      update: {
        status: 'DISCHARGED',
        dischargeRemarks: remarks,
        dischargedAt: lockStamp,
      },
      create: {
        patientId,
        therapistAccountId: session.user.id,
        status: 'DISCHARGED',
        dischargeRemarks: remarks,
        dischargedAt: lockStamp,
      },
    }),
    prisma.sessionNote.updateMany({
      where: {
        therapistAccountId: session.user.id,
        schedule: { patientId },
        lockedAt: null,
      },
      data: { lockedAt: lockStamp },
    }),
    // Lock IE / PR / Other documents the discharger uploaded for this
    // patient. Same rule as endorsement: read-only for everyone but
    // admin going forward.
    prisma.patientDocument.updateMany({
      where: {
        uploadedById: session.user.id,
        patientId,
        lockedAt: null,
      },
      data: { lockedAt: lockStamp },
    }),
  ])

  return NextResponse.json({ success: true })
}
