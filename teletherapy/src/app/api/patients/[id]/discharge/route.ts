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

  // Create/update assignment as DISCHARGED
  await prisma.patientAssignment.upsert({
    where: {
      patientId_therapistAccountId_status: {
        patientId,
        therapistAccountId: session.user.id,
        status: 'ACTIVE',
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
