import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const search = req.nextUrl.searchParams.get('search') ?? ''
  const isAdmin = session.user.role === 'ADMIN'

  // Get all patients that have had sessions with this clinician (or all for admin)
  const staffFilter = isAdmin ? {} : { staffId: session.user.staffId }

  const schedules = await prisma.schedule.findMany({
    where: {
      ...staffFilter,
      patientId: { not: null },
      status: 'CONFIRMED',
    },
    select: {
      patientId: true,
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          patientType: true,
          diagnosis: true,
        },
      },
    },
    distinct: ['patientId'],
  })

  let patients = schedules
    .filter((s) => s.patient !== null)
    .map((s) => s.patient!)

  // Apply search filter
  if (search) {
    const q = search.toLowerCase()
    patients = patients.filter(
      (p) =>
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        (p.email && p.email.toLowerCase().includes(q))
    )
  }

  // Sort by last name
  patients.sort((a, b) => a.lastName.localeCompare(b.lastName))

  // Get assignment status for each patient
  const patientIds = patients.map((p) => p.id)
  const assignments = await prisma.patientAssignment.findMany({
    where: {
      patientId: { in: patientIds },
      therapistAccountId: session.user.id,
    },
    select: {
      patientId: true,
      status: true,
    },
  })

  const assignmentMap = new Map(assignments.map((a) => [a.patientId, a.status]))

  const result = patients.map((p) => ({
    ...p,
    assignmentStatus: assignmentMap.get(p.id) ?? 'ACTIVE',
  }))

  return NextResponse.json({ patients: result })
}
