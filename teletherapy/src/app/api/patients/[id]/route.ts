import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
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
      city: true,
      address: true,
      referralUrl: true,
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

  // For interbranch clinicians: collect ALL their staffIds across branches
  const allBranchStaffIds = (session.user.branches ?? []).map((b: any) => b.staffId)
  const currentStaffId = currentAccount?.staffId ?? session.user.staffId
  const effectiveStaffIds = allBranchStaffIds.length > 0 ? allBranchStaffIds : [currentStaffId]
  const currentDepartment = currentAccount?.staff?.department ?? null

  const sessionNoteSelect = {
    id: true,
    status: true,
    notes: true,
    attachments: true,
    discontinuedRemarks: true,
    emailSentAt: true,
    createdAt: true,
  }

  // Include staff.id so the frontend can compute per-session edit
  // permissions (only the staff who actually delivered the session
  // is allowed to edit / delete that note — see canEdit below).
  const staffSelect = { id: true, firstName: true, lastName: true, department: true }

  // ── Sessions visible to this clinician ──
  // Continuity-of-care rule, scoped to discipline:
  //   - Admin sees every confirmed session.
  //   - A clinician with an assignment row (ACTIVE / DEACTIVATED /
  //     DISCHARGED / legacy ENDORSED) for the patient sees sessions
  //     from any staff in the SAME DEPARTMENT as them. So an OT
  //     receiving an endorsement sees the previous OT's notes but
  //     NOT the patient's MD or PT sessions, which is the right
  //     scope for clinical handoff.
  //   - A clinician with no assignment row only sees sessions they
  //     personally handled (the legacy "I had a session with X" case).
  let ownSessions
  if (isAdmin) {
    ownSessions = await prisma.schedule.findMany({
      where: { patientId: id, status: 'CONFIRMED' },
      include: { staff: { select: staffSelect }, sessionNote: { select: sessionNoteSelect } },
      orderBy: { date: 'desc' },
    })
  } else {
    const myAssignment = await prisma.patientAssignment.findFirst({
      where: { patientId: id, therapistAccountId: session.user.id },
      select: { id: true, status: true },
    })
    const sharedView = !!myAssignment

    let where: Record<string, unknown>
    if (sharedView && currentDepartment) {
      // Cross-staff but same-department visibility for continuity of care.
      where = {
        patientId: id,
        status: 'CONFIRMED',
        staff: { department: currentDepartment },
      }
    } else {
      // Fallback: only sessions this clinician personally handled.
      where = {
        patientId: id,
        status: 'CONFIRMED',
        staffId: { in: effectiveStaffIds },
      }
    }
    ownSessions = await prisma.schedule.findMany({
      where,
      include: { staff: { select: staffSelect }, sessionNote: { select: sessionNoteSelect } },
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
        staffId: { notIn: effectiveStaffIds },
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

  // Get assignment info — there's at most one row per (patient, therapist)
  // in the new model. Status drives write access.
  const assignment = await prisma.patientAssignment.findFirst({
    where: {
      patientId: id,
      therapistAccountId: session.user.id,
    },
  })

  // Read-only when the clinician has been endorsed-away or discharged
  // the patient, but they still keep visibility into past sessions for
  // continuity of care. Admins always have write access.
  const readOnly = !isAdmin && (
    assignment?.status === 'DEACTIVATED' ||
    assignment?.status === 'ENDORSED' ||
    assignment?.status === 'DISCHARGED'
  )

  // Per-session edit permission. The clinician who delivered the
  // session is the only one who can edit/delete its note (regardless
  // of who currently owns the patient). Admins can always edit.
  // This means: even after re-endorsement, neither party can edit the
  // OTHER's notes — Eloisa cannot retroactively edit Caitlynn's notes,
  // and once Eloisa endorsed away, she also can't edit her own old
  // notes anymore (because she's no longer ACTIVE for the patient,
  // readOnly=true catches that on the frontend).
  const mineSet = new Set(effectiveStaffIds)
  const sessionsWithPerms = ownSessions.map((s) => ({
    ...s,
    canEdit: isAdmin || (!readOnly && mineSet.has(s.staffId)),
  }))

  return NextResponse.json({
    patient,
    sessions: sessionsWithPerms,
    assignment,
    readOnly,
    otherServices, // e.g. ["MD", "OT"] — departments the patient also sees
  })
}
