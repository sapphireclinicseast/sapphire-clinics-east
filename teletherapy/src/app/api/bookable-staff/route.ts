// GET /api/bookable-staff?context=INTERNSHIP|MENTORSHIP
// Staff a mentee / intern can book a 1-on-1 with ("Set a Meeting → With a
// person"): people who published availability, scoped to the caller's OWN
// department and to the role that matters for the context —
//   • INTERNSHIP → internship supervisors
//   • MENTORSHIP → clinical mentors

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const u = session.user as unknown as {
    staffId?: string; department?: string; branches?: { staffId: string }[]
  }
  const context = new URL(req.url).searchParams.get('context') === 'MENTORSHIP' ? 'MENTORSHIP' : 'INTERNSHIP'
  const myDept = u.department ?? null
  const myStaffIds = new Set(Array.from(new Set([...(u.branches ?? []).map((b) => b.staffId), u.staffId].filter(Boolean))) as string[])

  const withSlots = await prisma.availabilitySlot.findMany({ select: { staffId: true }, distinct: ['staffId'] })
  const staffIds = withSlots.map((s) => s.staffId).filter(Boolean)
  if (staffIds.length === 0) return NextResponse.json({ staff: [] })

  const roleFilter = context === 'MENTORSHIP' ? { isClinicalMentor: true } : { isInternshipSupervisor: true }
  const staff = await prisma.staff.findMany({
    where: { id: { in: staffIds }, ...roleFilter },
    select: { id: true, firstName: true, lastName: true, department: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })
  return NextResponse.json({
    staff: staff
      .filter((s) => (!myDept || s.department === myDept) && !myStaffIds.has(s.id))
      .map((s) => ({ staffId: s.id, name: `${s.firstName} ${s.lastName}`, department: s.department })),
  })
}
