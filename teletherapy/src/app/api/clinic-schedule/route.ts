import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

  // Effective staff IDs: union across all branches for interbranch clinicians,
  // else the single staffId from the session.
  const branchStaffIds =
    session.user.branches?.map((b) => b.staffId).filter(Boolean) ?? []
  const effectiveStaffIds =
    branchStaffIds.length > 0
      ? branchStaffIds
      : session.user.staffId
        ? [session.user.staffId]
        : []
  if (effectiveStaffIds.length === 0) {
    return NextResponse.json({ schedules: [], summary: emptySummary() })
  }

  const dayStart = new Date(`${startDate}T00:00:00.000Z`)
  const dayEnd = new Date(`${endDate}T23:59:59.999Z`)

  const schedules = await prisma.schedule.findMany({
    where: {
      staffId: { in: effectiveStaffIds },
      date: { gte: dayStart, lte: dayEnd },
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      staff: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })

  // ── Summary stats ──────────────────────────────────────────────
  // Counts only CONFIRMED sessions (matches the spec).
  const confirmed = schedules.filter((s) => s.status === 'CONFIRMED')
  const uniquePatientIds = new Set(
    confirmed.map((s) => s.patientId).filter((id): id is string => !!id)
  )

  // Count of unique session-DAYS that have at least one confirmed session.
  const uniqueSessionDays = new Set(
    confirmed.map((s) => s.date.toISOString().slice(0, 10))
  )
  const avgPatientsPerDay =
    uniqueSessionDays.size > 0
      ? +(confirmed.length / uniqueSessionDays.size).toFixed(2)
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
      meetLink: s.meetLink,
      notes: s.notes,
      patient: s.patient,
      staff: s.staff,
    })),
    summary: {
      confirmedSessions: confirmed.length,
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
