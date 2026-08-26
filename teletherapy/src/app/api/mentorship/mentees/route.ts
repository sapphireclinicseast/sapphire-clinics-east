/**
 * This Clinical Mentor's own mentees.
 * Source of truth = Staff.menteeIds (HR Staff Profile picker, synced
 * one-way into the shared DB by Operations Hub). Unlike Intern Supervision's
 * decking, there's no schedule-derived roster here — mentees are regular
 * staff with their own independent caseload, explicitly picked in HR.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as { role?: string; staffId?: string; isClinicalMentor?: boolean }
  const isAdmin = user.role === 'ADMIN'
  if (!isAdmin && !user.isClinicalMentor) {
    return NextResponse.json({ error: 'Clinical Mentor access required.' }, { status: 403 })
  }
  if (!user.staffId) return NextResponse.json({ mentees: [] })

  // Fetched live rather than trusting the session token — a mentee just
  // added in HR should show up on the next page load, not the next login.
  const mentor = await prisma.staff.findUnique({
    where: { id: user.staffId },
    select: { menteeIds: true },
  })
  const menteeIds = mentor?.menteeIds ?? []
  if (!menteeIds.length) return NextResponse.json({ mentees: [] })

  const mentees = await prisma.staff.findMany({
    where: { id: { in: menteeIds } },
    select: { id: true, firstName: true, lastName: true, department: true, branch: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return NextResponse.json({
    mentees: mentees.map((m) => ({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`,
      department: m.department,
      branch: m.branch,
    })),
  })
}
