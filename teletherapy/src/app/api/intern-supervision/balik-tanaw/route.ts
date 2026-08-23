/**
 * Supervisor view of Balik-Tanaw: the weekly reflections submitted by the
 * interns decked to the current supervisor. Read-only here; signing is done
 * via /api/balik-tanaw/[id]/sign.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as { role?: string; staffId?: string; branches?: { staffId: string }[] }
  const isAdmin = user.role === 'ADMIN'
  const myStaffIds = (user.branches ?? []).map((b) => b.staffId).filter(Boolean)
  const staffPool = myStaffIds.length > 0 ? myStaffIds : ([user.staffId].filter(Boolean) as string[])

  // Interns decked to me.
  const deck = await prisma.schedule.findMany({
    where: { internStaffId: { not: null }, ...(isAdmin ? {} : { staffId: { in: staffPool } }) },
    select: { internStaffId: true },
    distinct: ['internStaffId'],
  })
  const internIds = deck.map((d) => d.internStaffId).filter((x): x is string => !!x)
  if (internIds.length === 0) return NextResponse.json({ entries: [] })

  const [entries, staff] = await Promise.all([
    // @ts-ignore — balikTanaw
    prisma.balikTanaw.findMany({ where: { internStaffId: { in: internIds } }, orderBy: { createdAt: 'desc' } }),
    prisma.staff.findMany({ where: { id: { in: internIds } }, select: { id: true, firstName: true, lastName: true } }),
  ])
  const nameById = new Map(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`]))

  const out = (entries as { internStaffId: string }[]).map((e) => ({
    ...e,
    internName: nameById.get(e.internStaffId) ?? 'Intern',
  }))
  return NextResponse.json({ entries: out })
}
