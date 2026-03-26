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

  // Get the current clinician's staff record to know their department
  const currentAccount = !isAdmin ? await prisma.therapistAccount.findUnique({
    where: { id: session.user.id },
    include: { staff: { select: { id: true, department: true } } },
  }) : null

  const currentStaffId = currentAccount?.staffId ?? session.user.staffId
  const currentDepartment = currentAccount?.staff?.department ?? null

  // For NON-ADMIN clinicians: only show sessions handled by THIS specific clinician
  // Even endorsed patients — only show sessions where the clinician was the provider
  // Admin sees everything
  let ownSessions
  if (isAdmin) {
    ownSessions = await prisma.schedule.findMany({
      where: {
        patientId: id,
        status: 'CONFIRMED',
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
  } else {
    // For endorsed patients, also include sessions from the original clinician who endorsed
    // But ONLY if they are in the same department AND specifically endorsed to this clinician
    // For confidentiality: only show sessions handled by THIS clinician
    // Even if endorsed, the new clinician starts fresh — no access to previous notes
    ownSessions = await prisma.schedule.findMany({
      where: {
        patientId: id,
        status: 'CONFIRMED',
        staffId: currentStaffId,
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
  }

  // For NON-ADMIN: find what OTHER departments/services this patient has used
  // without revealing session details
  let otherServices: string[] = []
  if (!isAdmin) {
    const allDepartments = await prisma.schedule.findMany({
      where: {
        patientId: id,
        status: 'CONFIRMED',
        staffId: { not: currentStaffId },
      },
      select: {
        staff: {
          select: { department: true },
        },
      },
      distinct: ['staffId'],
    })

    // Collect unique department abbreviations that are NOT the current clinician's
    const deptSet = new Set<string>()
    for (const s of allDepartments) {
      if (s.staff?.department && s.staff.department !== currentDepartment) {
        deptSet.add(s.staff.department)
      }
    }
    otherServices = Array.from(deptSet).sort()
  }

  // Get assignment info
  const assignment = await prisma.patientAssignment.findFirst({
    where: {
      patientId: id,
      therapistAccountId: session.user.id,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    patient,
    sessions: ownSessions,
    assignment,
    otherServices, // e.g. ["MD", "OT"] — departments the patient also sees
  })
}
