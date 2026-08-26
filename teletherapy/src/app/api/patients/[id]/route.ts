import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isNoteAgeLocked } from '@/lib/note-age-lock'

// Psychology / Medical (MD) session notes & reports are confidential by
// default — hidden from OTHER departments (and the patient) unless the author
// ticked "Show to Others". All other departments are unaffected.
const CONFIDENTIAL_DEPTS: ('PSYCHOLOGY' | 'MD')[] = ['PSYCHOLOGY', 'MD']

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
      pwdIdUrl: true,
      pwdSeniorId: true,
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
    sharedWithOthers: true,
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
  // Continuity-of-care rule, gated on active status:
  //   - Admin sees every confirmed session.
  //   - A clinician with an ACTIVE assignment row sees EVERY professional's
  //     confirmed sessions for the patient, across ALL departments — so an OT
  //     treating a child can read the SLP's, PT's, MD's and psychologist's
  //     notes for that same child (interdisciplinary collaboration). Notes are
  //     view-only unless the clinician personally authored them (canEdit).
  //   - A clinician with a non-ACTIVE row (DEACTIVATED / DISCHARGED /
  //     legacy ENDORSED) OR no row at all only sees sessions they
  //     personally handled. Critically, a DEACTIVATED clinician must
  //     NOT see new notes the active owner is writing — they only
  //     see their own historical contribution. If endorsed back to
  //     ACTIVE, they regain the full interdisciplinary view.
  let ownSessions
  // Other departments' notes AND documents for this patient, shown READ-ONLY
  // in a separate subsection — never mixed into the clinician's own note-making
  // list. otherDeptStaffOut is the named roster of professionals from other
  // departments so the care team can coordinate.
  const otherDeptOut: Record<string, unknown>[] = []
  const otherDeptDocsOut: Record<string, unknown>[] = []
  const otherDeptStaffOut: { name: string; department: string }[] = []
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

    // Interdisciplinary visibility is broader than sharedView: a clinician who
    // delivers sessions but has NO assignment row (many patients have none) is
    // still an active carer. Only an explicit endorsed-away / deactivated /
    // discharged status removes their cross-department read access.
    const isActiveCarer = !myAssignment || myAssignment.status === 'ACTIVE'

    let where: Record<string, unknown>
    if (sharedView && currentDepartment) {
      // The clinician's OWN note-making list stays within their own department
      // (continuity of care across staff in the same discipline). Notes from
      // OTHER departments are surfaced separately below, read-only, so they are
      // never mixed into the area where the clinician writes their own notes.
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

    // Interdepartmental notes: any active carer sees the OTHER departments'
    // confirmed sessions that actually have a note. READ-ONLY — the clinician
    // can view but never edit another professional's note.
    if (isActiveCarer && currentDepartment) {
      const otherRows = await prisma.schedule.findMany({
        where: {
          patientId: id,
          status: 'CONFIRMED',
          staff: { department: { not: currentDepartment } },
          sessionNote: { isNot: null },
          // Psychology/MD notes are confidential unless the author shared them.
          OR: [
            { staff: { department: { notIn: CONFIDENTIAL_DEPTS } } },
            { sessionNote: { sharedWithOthers: true } },
          ],
        },
        include: { staff: { select: staffSelect }, sessionNote: { select: sessionNoteSelect } },
        orderBy: { date: 'desc' },
      })
      for (const r of otherRows) otherDeptOut.push({ ...r, canEdit: false })

      // Interdepartmental documents: IE reports, Progress Reports and other
      // uploads from OTHER departments — read-only, so the full interdisciplinary
      // record is visible for coordination. File download is auth-gated only,
      // so linking these is safe.
      const otherDocs = await prisma.patientDocument.findMany({
        where: {
          patientId: id,
          department: { not: currentDepartment },
          // Psychology/MD reports are confidential unless shared.
          OR: [
            { department: { notIn: CONFIDENTIAL_DEPTS } },
            { sharedWithOthers: true },
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, department: true, documentType: true, fileName: true,
          filePath: true, description: true, createdAt: true, uploadedById: true,
        },
      })
      // PatientDocument has no relation to the account, so resolve uploader
      // names in one lookup.
      const uploaderIds = [...new Set(otherDocs.map((d) => d.uploadedById))]
      const uploaders = uploaderIds.length
        ? await prisma.therapistAccount.findMany({
            where: { id: { in: uploaderIds } },
            select: { id: true, staff: { select: { firstName: true, lastName: true } } },
          })
        : []
      const nameById = new Map(
        uploaders.map((u) => [u.id, u.staff ? `${u.staff.firstName} ${u.staff.lastName}` : '']),
      )
      for (const d of otherDocs) {
        otherDeptDocsOut.push({
          id: d.id,
          department: d.department,
          documentType: d.documentType,
          fileName: d.fileName,
          filePath: d.filePath,
          description: d.description,
          createdAt: d.createdAt,
          uploaderName: nameById.get(d.uploadedById) ?? '',
        })
      }
    }
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
          select: { id: true, firstName: true, lastName: true, department: true },
        },
      },
      distinct: ['staffId'],
    })

    // Collect unique department abbreviations, plus the named roster of the
    // professionals from those departments, so the care team can coordinate.
    const deptSet = new Set<string>()
    const seenStaff = new Set<string>()
    for (const s of allDepartments) {
      const st = s.staff
      if (st?.department && st.department !== currentDepartment) {
        deptSet.add(st.department)
        if (st.id && !seenStaff.has(st.id)) {
          seenStaff.add(st.id)
          otherDeptStaffOut.push({ name: `${st.firstName} ${st.lastName}`, department: st.department })
        }
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
  //   4. The session hasn't aged out of the documentation window
  //      (see @/lib/note-age-lock). Unlike lockedAt this one is
  //      reversible — the clinician re-opens it on the session page —
  //      so it's surfaced separately as ageLocked rather than being
  //      folded invisibly into canEdit.
  const mineSet = new Set(effectiveStaffIds)
  const sessionsWithPerms = ownSessions.map((s) => {
    const ageLocked = isNoteAgeLocked(s)
    return {
      ...s,
      ageLocked,
      canEdit:
        isAdmin ||
        (!readOnly && mineSet.has(s.staffId) && !s.sessionNote?.lockedAt && !ageLocked),
    }
  })

  return NextResponse.json({
    patient,
    sessions: sessionsWithPerms,
    assignment,
    readOnly,
    otherServices, // e.g. ["MD", "OT"] — departments the patient also sees
    otherDeptSessions: otherDeptOut, // read-only notes from other departments
    otherDeptDocuments: otherDeptDocsOut, // read-only IE/PR/other docs from other departments
    otherDeptStaff: otherDeptStaffOut, // named roster of other-department professionals
  })
}
