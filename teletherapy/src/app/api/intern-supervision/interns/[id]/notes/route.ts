/**
 * One intern's session notes — every SessionNote from a session they did as
 * the intern (Schedule.internStaffId = this id), regardless of which
 * supervisor's schedule it sits under.
 *
 * Access: admin, the decked supervisor(s) for this specific intern (existing
 * rule, same as the profile route), OR — new — a Clinical Internship
 * Supervisor (Staff.isInternshipSupervisor, tagged in HR Staff Profiles and
 * synced into the shared DB by Operations Hub), who may view ANY intern's
 * notes org-wide.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const user = session.user as { role?: string; staffId?: string; branches?: { staffId: string }[]; isInternshipSupervisor?: boolean }
  const isAdmin = user.role === 'ADMIN'
  const isTaggedSupervisor = !!user.isInternshipSupervisor

  if (!isAdmin && !isTaggedSupervisor) {
    const myStaffIds = (user.branches ?? []).map((b) => b.staffId).filter(Boolean)
    const staffPool = myStaffIds.length > 0 ? myStaffIds : ([user.staffId].filter(Boolean) as string[])
    const decked = await prisma.schedule.findFirst({ where: { internStaffId: id, staffId: { in: staffPool } }, select: { id: true } })
    if (!decked) return NextResponse.json({ error: 'You do not supervise this intern.' }, { status: 403 })
  }

  const intern = await prisma.staff.findUnique({
    where: { id },
    select: { id: true, firstName: true, lastName: true, department: true, branch: true },
  })
  if (!intern) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const schedules = await prisma.schedule.findMany({
    where: { internStaffId: id, sessionNote: { isNot: null } },
    select: {
      id: true,
      date: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
      staff: { select: { firstName: true, lastName: true } }, // the supervising clinician
      sessionNote: {
        select: {
          id: true, status: true, notes: true, isInitialEvaluation: true,
          discontinuedRemarks: true, lockedAt: true, editHistory: true,
          createdAt: true, updatedAt: true,
        },
      },
    },
    orderBy: { date: 'desc' },
  })

  const notes = schedules
    .filter((s) => s.sessionNote)
    .map((s) => ({
      scheduleId: s.id,
      date: s.date,
      patientName: s.patient ? `${s.patient.firstName} ${s.patient.lastName}` : '—',
      supervisorName: s.staff ? `${s.staff.firstName} ${s.staff.lastName}` : '—',
      ...s.sessionNote,
    }))

  return NextResponse.json({
    intern: { id: intern.id, name: `${intern.firstName} ${intern.lastName}`, department: intern.department, branch: intern.branch },
    notes,
  })
}
