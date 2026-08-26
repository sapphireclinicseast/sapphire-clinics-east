// GET /api/intern-supervision/meeting-people
// People who can be ticked as invitees for a supervision / mentorship meeting:
// interns (decked to the caller, or all for admin / tagged supervisor) and
// internship supervisors.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const u = session.user as unknown as {
    id: string; role?: string; staffId?: string; isInternshipSupervisor?: boolean
    branches?: { staffId: string }[]
  }
  const isAdmin = u.role === 'ADMIN'
  const canSeeAll = isAdmin || !!u.isInternshipSupervisor
  const myStaffIds = Array.from(new Set([...(u.branches ?? []).map((b) => b.staffId), u.staffId].filter(Boolean))) as string[]

  const decked = await prisma.schedule.findMany({
    where: canSeeAll
      ? { internStaffId: { not: null } }
      : { internStaffId: { not: null }, staffId: { in: myStaffIds } },
    select: { internStaffId: true },
    distinct: ['internStaffId'],
  })
  const internIds = decked.map((d) => d.internStaffId).filter((x): x is string => !!x)

  const [interns, supervisors] = await Promise.all([
    internIds.length
      ? prisma.staff.findMany({ where: { id: { in: internIds } }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] })
      : Promise.resolve([]),
    prisma.staff.findMany({ where: { isInternshipSupervisor: true }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] }),
  ])

  const fmt = (s: { id: string; firstName: string; lastName: string }) => ({ staffId: s.id, name: `${s.firstName} ${s.lastName}` })
  return NextResponse.json({ interns: interns.map(fmt), supervisors: supervisors.map(fmt) })
}
