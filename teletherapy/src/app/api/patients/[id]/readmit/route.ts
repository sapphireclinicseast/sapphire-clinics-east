import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: patientId } = await params

  // New model: at most one row per (patient, therapist). Find that
  // single row, confirm it's DISCHARGED, flip back to ACTIVE.
  const row = await prisma.patientAssignment.findUnique({
    where: {
      patientId_therapistAccountId: {
        patientId,
        therapistAccountId: session.user.id,
      },
    },
  })

  if (!row || row.status !== 'DISCHARGED') {
    return NextResponse.json({ error: 'No discharged assignment found' }, { status: 404 })
  }

  await prisma.patientAssignment.update({
    where: { id: row.id },
    data: {
      status: 'ACTIVE',
      dischargeRemarks: null,
      dischargedAt: null,
    },
  })

  return NextResponse.json({ success: true })
}
