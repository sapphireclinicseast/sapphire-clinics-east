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

  const discharged = await prisma.patientAssignment.findUnique({
    where: {
      patientId_therapistAccountId_status: {
        patientId,
        therapistAccountId: session.user.id,
        status: 'DISCHARGED',
      },
    },
  })

  if (!discharged) {
    return NextResponse.json({ error: 'No discharged assignment found' }, { status: 404 })
  }

  await prisma.patientAssignment.update({
    where: { id: discharged.id },
    data: {
      status: 'ACTIVE',
      dischargeRemarks: null,
      dischargedAt: null,
    },
  })

  return NextResponse.json({ success: true })
}
