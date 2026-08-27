// GET /api/intern-supervision/meeting-people?context=INTERNSHIP|MENTORSHIP
//
// People who can be ticked as invitees for a meeting, scoped to the caller's
// OWN department (no interdepartment invites) and to the roles that matter for
// the context:
//   • INTERNSHIP → Supervisors (tagged) + Interns (decked), same department.
//   • MENTORSHIP → Mentors (tagged) + Mentees (in a mentor's mentee list),
//     same department.
// Returns { groups: [{ key, label, people: [{ staffId, name }] }] }.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Row = { id: string; firstName: string; lastName: string; department: string | null }
const fmt = (s: Row) => ({ staffId: s.id, name: `${s.firstName} ${s.lastName}` })

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const u = session.user as unknown as {
    id: string; role?: string; staffId?: string; department?: string
    isInternshipSupervisor?: boolean; branches?: { staffId: string }[]
  }
  const isAdmin = u.role === 'ADMIN'
  const context = new URL(req.url).searchParams.get('context') === 'MENTORSHIP' ? 'MENTORSHIP' : 'INTERNSHIP'
  const myDept = u.department ?? null
  const myStaffIds = new Set(Array.from(new Set([...(u.branches ?? []).map((b) => b.staffId), u.staffId].filter(Boolean))) as string[])

  // Keep only same-department people, and never list the caller themselves.
  const sameDept = (r: Row) => (!myDept || r.department === myDept) && !myStaffIds.has(r.id)
  const select = { id: true, firstName: true, lastName: true, department: true } as const
  const orderBy = [{ firstName: 'asc' as const }, { lastName: 'asc' as const }]

  if (context === 'MENTORSHIP') {
    const [mentorRows, mentorLists] = await Promise.all([
      prisma.staff.findMany({ where: { isClinicalMentor: true }, select, orderBy }),
      prisma.staff.findMany({ where: { isClinicalMentor: true }, select: { menteeIds: true } }),
    ])
    const menteeIds = Array.from(new Set(mentorLists.flatMap((m) => m.menteeIds ?? [])))
    const menteeRows = menteeIds.length
      ? await prisma.staff.findMany({ where: { id: { in: menteeIds } }, select, orderBy })
      : []
    return NextResponse.json({
      groups: [
        { key: 'mentors', label: 'Mentors', people: mentorRows.filter(sameDept).map(fmt) },
        { key: 'mentees', label: 'Mentees', people: menteeRows.filter(sameDept).map(fmt) },
      ],
    })
  }

  // INTERNSHIP
  const canSeeAll = isAdmin || !!u.isInternshipSupervisor
  const decked = await prisma.schedule.findMany({
    where: canSeeAll
      ? { internStaffId: { not: null } }
      : { internStaffId: { not: null }, staffId: { in: Array.from(myStaffIds) } },
    select: { internStaffId: true },
    distinct: ['internStaffId'],
  })
  const internIds = decked.map((d) => d.internStaffId).filter((x): x is string => !!x)
  const [supervisorRows, internRows] = await Promise.all([
    prisma.staff.findMany({ where: { isInternshipSupervisor: true }, select, orderBy }),
    internIds.length ? prisma.staff.findMany({ where: { id: { in: internIds } }, select, orderBy }) : Promise.resolve([]),
  ])
  return NextResponse.json({
    groups: [
      { key: 'supervisors', label: 'Supervisors', people: supervisorRows.filter(sameDept).map(fmt) },
      { key: 'interns', label: 'Interns', people: internRows.filter(sameDept).map(fmt) },
    ],
  })
}
