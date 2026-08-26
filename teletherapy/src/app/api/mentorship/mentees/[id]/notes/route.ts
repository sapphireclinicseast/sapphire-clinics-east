/**
 * One mentee's session notes — every SessionNote authored by their
 * TherapistAccount, regardless of which Schedule.staffId the session sits
 * under. Unlike Intern Supervision (interns are decked under a supervisor's
 * schedule, keyed by Schedule.internStaffId), mentees carry their own
 * independent caseload, so notes are looked up by SessionNote.therapistAccountId
 * directly.
 *
 * Access: admin, or a Clinical Mentor (Staff.isClinicalMentor, tagged in HR
 * Staff Profiles) — scoped to only the specific people picked into their own
 * menteeIds, never org-wide (narrower than Intern Supervision's tagged flag).
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params // mentee's Staff.id

  const user = session.user as { role?: string; isClinicalMentor?: boolean; mentorTherapistAccountIds?: string[] }
  const isAdmin = user.role === 'ADMIN'

  const mentee = await prisma.staff.findUnique({
    where: { id },
    select: {
      id: true, firstName: true, lastName: true, department: true, branch: true,
      therapistAccount: { select: { id: true } },
    },
  })
  if (!mentee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const menteeSummary = { id: mentee.id, name: `${mentee.firstName} ${mentee.lastName}`, department: mentee.department, branch: mentee.branch }

  // No login account yet (never signed in) — nothing to show, not an error.
  if (!mentee.therapistAccount) return NextResponse.json({ mentee: menteeSummary, notes: [] })

  if (!isAdmin) {
    if (!user.isClinicalMentor) return NextResponse.json({ error: 'Clinical Mentor access required.' }, { status: 403 })
    const allowed = (user.mentorTherapistAccountIds ?? []).includes(mentee.therapistAccount.id)
    if (!allowed) return NextResponse.json({ error: 'You do not mentor this person.' }, { status: 403 })
  }

  const notes = await prisma.sessionNote.findMany({
    where: { therapistAccountId: mentee.therapistAccount.id },
    select: {
      id: true, status: true, notes: true, isInitialEvaluation: true,
      discontinuedRemarks: true, lockedAt: true, editHistory: true,
      createdAt: true, updatedAt: true,
      schedule: { select: { id: true, date: true, patient: { select: { id: true, firstName: true, lastName: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    mentee: menteeSummary,
    notes: notes.map((n) => ({
      scheduleId: n.schedule.id,
      date: n.schedule.date,
      patientName: n.schedule.patient ? `${n.schedule.patient.firstName} ${n.schedule.patient.lastName}` : '—',
      id: n.id,
      status: n.status,
      notes: n.notes,
      isInitialEvaluation: n.isInitialEvaluation,
      discontinuedRemarks: n.discontinuedRemarks,
      lockedAt: n.lockedAt,
      editHistory: n.editHistory,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    })),
  })
}
