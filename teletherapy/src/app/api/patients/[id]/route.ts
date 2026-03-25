import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const isAdmin = session.user.role === 'ADMIN'

  const patient = await prisma.patient.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      patientType: true,
      diagnosis: true,
      dob: true,
      sex: true,
    },
  })

  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  // Check if patient was endorsed to this clinician — if so, show ALL sessions
  const hasActiveAssignment = !isAdmin ? await prisma.patientAssignment.findFirst({
    where: { patientId: id, therapistAccountId: session.user.id, status: 'ACTIVE' },
  }) : null

  // If endorsed or admin, show all sessions; otherwise only own sessions
  const staffFilter = isAdmin || hasActiveAssignment ? {} : { staffId: session.user.staffId }

  const sessions = await prisma.schedule.findMany({
    where: {
      patientId: id,
      status: 'CONFIRMED',
      ...staffFilter,
    },
    include: {
      staff: {
        select: { firstName: true, lastName: true, department: true },
      },
      sessionNote: {
        select: {
          id: true,
          status: true,
          notes: true,
          attachments: true,
          discontinuedRemarks: true,
          emailSentAt: true,
          createdAt: true,
        },
      },
    },
    orderBy: { date: 'desc' },
  })

  // Get assignment info
  const assignment = await prisma.patientAssignment.findFirst({
    where: {
      patientId: id,
      therapistAccountId: session.user.id,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ patient, sessions, assignment })
}
