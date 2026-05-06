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
  await prisma.patientAssignment.upsert({
    where: {
      patientId_therapistAccountId: {
        patientId,
        therapistAccountId: session.user.id,
      },
    },
    update: {
      status: 'DISCHARGED',
      dischargeRemarks: remarks,
      dischargedAt: new Date(),
    },
    create: {
      patientId,
      therapistAccountId: session.user.id,
      status: 'DISCHARGED',
      dischargeRemarks: remarks,
      dischargedAt: new Date(),
    },
  })

  return NextResponse.json({ success: true })
}
