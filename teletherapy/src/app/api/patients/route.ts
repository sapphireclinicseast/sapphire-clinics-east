import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { scheduleBranchWhere, patientBranchWhere } from '@/lib/branch-filter'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const search = req.nextUrl.searchParams.get('search') ?? ''
  const requestedStaffId = req.nextUrl.searchParams.get('staffId')
  const isAdmin = session.user.role === 'ADMIN'

  // Determine effective staffId (support interbranch switching)
  let effectiveStaffId = session.user.staffId
  if (requestedStaffId && !isAdmin) {
    const allowedStaffIds = (session.user.branches ?? []).map((b: any) => b.staffId)
    if (allowedStaffIds.includes(requestedStaffId)) {
      effectiveStaffId = requestedStaffId
    }
  }

  // Merged interbranch consultants share one staffId; when the switcher sends
  // a patientBranch, scope by the patient's branch. Legacy per-branch
  // consultants never send it, so their behaviour is unchanged.
  const requestedBranch = (req.nextUrl.searchParams.get('patientBranch') ?? '').trim()
  const primaryBranch = (session.user as { branch?: string }).branch ?? ''
  const scheduleBranch = requestedBranch ? scheduleBranchWhere(requestedBranch, primaryBranch) : {}
  const patientBranch = requestedBranch ? patientBranchWhere(requestedBranch, primaryBranch) : {}

  // 1. Get patients from direct sessions (staffId match)
  const staffFilter = isAdmin ? {} : { staffId: effectiveStaffId }

  const schedules = await prisma.schedule.findMany({
    where: {
      ...staffFilter,
      ...scheduleBranch,
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

  const patientMap = new Map<string, typeof schedules[0]['patient']>()
  for (const s of schedules) {
    if (s.patient) patientMap.set(s.patient.id, s.patient)
  }

  // 2. Also get patients tied to this clinician via PatientAssignment.
  //    Include every assignment row regardless of status:
  //      - ACTIVE       — currently owned, write-allowed.
  //      - DEACTIVATED  — previously owned, read-only (continuity of care).
  //      - DISCHARGED   — discharged by THIS clinician; needs to stay in
  //                       their list so they can re-admit, review history,
  //                       etc. The Patients page has a dedicated DISCHARGED
  //                       filter tab that depends on these rows.
  //      - ENDORSED     — legacy equivalent of DEACTIVATED.
  //    Freshly-endorsed-to patients with no sessions yet need to appear,
  //    so we don't gate on having a confirmed session here — assignment
  //    is itself the access grant.
  if (!isAdmin) {
    const myAssignments = await prisma.patientAssignment.findMany({
      where: {
        therapistAccountId: session.user.id,
        ...(requestedBranch ? { patient: patientBranch } : {}),
      },
      include: {
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
    })
    for (const a of myAssignments) {
      if (a.patient && !patientMap.has(a.patient.id)) {
        patientMap.set(a.patient.id, a.patient)
      }
    }
  }

  let patients = Array.from(patientMap.values()).filter(Boolean) as NonNullable<typeof schedules[0]['patient']>[]

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
