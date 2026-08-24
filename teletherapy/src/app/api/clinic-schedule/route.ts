import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { scheduleBranchWhere } from '@/lib/branch-filter'
import { hostifyMeetLink } from '@/lib/meet-link'

// GET /api/clinic-schedule?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Returns the logged-in clinician's confirmed/pending sessions in the
// given date range, plus summary stats. For interbranch clinicians,
// pulls schedules across all of their staff IDs.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: 'startDate and endDate are required (YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  // Effective staff IDs:
  //  • If ?staffId=… is provided AND it belongs to the logged-in
  //    clinician's branch list, scope to just that one (used by the
  //    BranchSwitcher to view a single branch at a time).
  //  • Otherwise, union across all branches.
  const branchStaffIds =
    session.user.branches?.map((b) => b.staffId).filter(Boolean) ?? []
  const requestedStaffId = (searchParams.get('staffId') ?? '').trim()
  let effectiveStaffIds: string[]
  if (requestedStaffId && branchStaffIds.includes(requestedStaffId)) {
    effectiveStaffIds = [requestedStaffId]
  } else if (requestedStaffId && requestedStaffId === session.user.staffId) {
    effectiveStaffIds = [requestedStaffId]
  } else {
    effectiveStaffIds =
      branchStaffIds.length > 0
        ? branchStaffIds
        : session.user.staffId
          ? [session.user.staffId]
          : []
  }
  if (effectiveStaffIds.length === 0) {
    return NextResponse.json({ schedules: [], summary: emptySummary() })
  }

  // Merged interbranch consultants share one staffId across branches, so
  // staffId alone can't tell their branches apart. When the switcher sends a
  // patientBranch, scope by the PATIENT's branch instead (the consultant's
  // primary branch also keeps sessions whose patient has no branch, so none
  // silently disappear). Legacy per-branch-staffId consultants never send it.
  const requestedBranch = (searchParams.get('patientBranch') ?? '').trim()
  const branchWhere = requestedBranch
    ? await scheduleBranchWhere(requestedBranch, session.user.branch ?? '')
    : {}

  const dayStart = new Date(`${startDate}T00:00:00.000Z`)
  const dayEnd = new Date(`${endDate}T23:59:59.999Z`)

  // Own schedule OR a session this clinician was assigned to as the intern
  // (booked under a supervisor's card — staffId is the supervisor's, not
  // theirs). branchWhere can independently be an OR clause too, so these are
  // composed under AND rather than spread into one object, or one `OR` key
  // would silently clobber the other.
  const staffOrIntern = {
    OR: [{ staffId: { in: effectiveStaffIds } }, { internStaffId: { in: effectiveStaffIds } }],
  }

  // Pull schedules for the visible date range (drives the day/week/month grid)
  // AND, in parallel, the full lifetime CONFIRMED set used for the summary
  // cards. The user wants the cards to reflect totals "since the very start"
  // rather than just the visible range.
  const [schedules, lifetimeConfirmed] = await Promise.all([
    prisma.schedule.findMany({
      where: {
        date: { gte: dayStart, lte: dayEnd },
        AND: [staffOrIntern, branchWhere],
      },
      include: {
        patient: {
          select: {
            id: true, firstName: true, lastName: true,
            dob: true, sex: true, patientType: true, diagnosis: true, city: true,
          },
        },
        staff: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
        internStaff: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    }),
    prisma.schedule.findMany({
      where: {
        status: 'CONFIRMED',
        AND: [staffOrIntern, branchWhere],
      },
      select: { date: true, patientId: true },
    }),
  ])

  // ── Summary stats — LIFETIME, not range-scoped ─────────────────
  const uniquePatientIds = new Set(
    lifetimeConfirmed.map((s) => s.patientId).filter((id): id is string => !!id)
  )
  const uniqueSessionDays = new Set(
    lifetimeConfirmed.map((s) => s.date.toISOString().slice(0, 10))
  )
  const avgPatientsPerDay =
    uniqueSessionDays.size > 0
      ? +(lifetimeConfirmed.length / uniqueSessionDays.size).toFixed(2)
      : 0

  return NextResponse.json({
    schedules: schedules.map((s) => ({
      id: s.id,
      date: s.date.toISOString().slice(0, 10),
      startTime: s.startTime,
      endTime: s.endTime,
      duration: s.duration,
      sessionType: s.sessionType,
      status: s.status,
      meetLink: hostifyMeetLink(s.meetLink, session.user.name),
      notes: s.notes,
      patient: s.patient
        ? {
            id: s.patient.id,
            firstName: s.patient.firstName,
            lastName: s.patient.lastName,
            dob: s.patient.dob ? s.patient.dob.toISOString().slice(0, 10) : null,
            sex: s.patient.sex,
            patientType: s.patient.patientType,
            diagnosis: s.patient.diagnosis,
            city: s.patient.city ?? null,
          }
        : null,
      staff: s.staff,
      intern: s.internStaff,
    })),
    summary: {
      confirmedSessions: lifetimeConfirmed.length,
      uniquePatients: uniquePatientIds.size,
      avgPatientsPerDay,
      activeDays: uniqueSessionDays.size,
    },
  })
}

function emptySummary() {
  return {
    confirmedSessions: 0,
    uniquePatients: 0,
    avgPatientsPerDay: 0,
    activeDays: 0,
  }
}
