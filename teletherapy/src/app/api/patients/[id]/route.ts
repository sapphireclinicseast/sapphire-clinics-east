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
    // Permanent freeze marker. Set when the authoring clinician was
    // endorsed/discharged off this patient. The frontend uses it to
    // gate edit/delete affordances (canEdit also checks it below).
    lockedAt: true,
  }

  // Include staff.id so the frontend can compute per-session edit
  // permissions (only the staff who actually delivered the session
  // is allowed to edit / delete that note — see canEdit below).
  const staffSelect = { id: true, firstName: true, lastName: true, department: true }

  // ── Sessions visible to this clinician ──
  // Continuity-of-care rule, scoped to discipline AND active status:
  //   - Admin sees every confirmed session.
  //   - A clinician with an ACTIVE assignment row sees sessions from
  //     any staff in the SAME DEPARTMENT as them. So an OT receiving
  //     an endorsement sees the previous OT's notes (read-only,
  //     because those notes are locked) but NOT MD or PT sessions.
  //   - A clinician with a non-ACTIVE row (DEACTIVATED / DISCHARGED /
  //     legacy ENDORSED) OR no row at all only sees sessions they
  //     personally handled. Critically, a DEACTIVATED clinician must
  //     NOT see new notes the active owner is writing — they only
  //     see their own historical contribution. If endorsed back to
  //     ACTIVE, they regain same-department visibility (and by then
  //     the other clinician's notes are locked, so still read-only).
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
    // Only ACTIVE owners get cross-staff continuity-of-care view.
    // Anything else (DEACTIVATED, DISCHARGED, legacy ENDORSED, or no
    // assignment at all) falls back to "only sessions I personally
    // handled" — which is exactly what a deactivated clinician needs
    // so they can't peek at the new owner's ongoing notes.
    const sharedView = myAssignment?.status === 'ACTIVE'

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

  // Per-session edit permission. Three things must all be true for a
  // clinician to edit/delete a session note:
  //   1. They are the staff who actually delivered the session
  //      (mineSet check) — you don't get to edit someone else's note.
  //   2. They are not currently in read-only mode for this patient
  //      (i.e. they are the ACTIVE owner) — DEACTIVATED/DISCHARGED
  //      clinicians can view but not write.
  //   3. The note itself is not locked. lockedAt is stamped on the
  //      note the moment the author is endorsed/discharged off the
  //      patient. Once stamped, it never clears — even if the patient
  //      is endorsed back to that same clinician, their old notes
  //      stay frozen at the signature point. New notes they write
  //      after re-endorsement start unlocked again.
  // Admins always get edit access.
  const mineSet = new Set(effectiveStaffIds)
  const sessionsWithPerms = ownSessions.map((s) => ({
    ...s,
    canEdit:
      isAdmin ||
      (!readOnly && mineSet.has(s.staffId) && !s.sessionNote?.lockedAt),
  }))

  return NextResponse.json({
    patient,
    sessions: sessionsWithPerms,
    assignment,
    readOnly,
    otherServices, // e.g. ["MD", "OT"] — departments the patient also sees
  })
}
