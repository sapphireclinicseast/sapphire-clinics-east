/**
 * Supervisor view of the Learning Outcomes & Preferences submitted by the
 * interns decked to the current supervisor (read-only).
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

  const deck = await prisma.schedule.findMany({
    where: { internStaffId: { not: null }, ...(isAdmin ? {} : { staffId: { in: staffPool } }) },
    select: { internStaffId: true },
    distinct: ['internStaffId'],
  })
  const internIds = deck.map((d) => d.internStaffId).filter((x): x is string => !!x)
  if (internIds.length === 0) return NextResponse.json({ profiles: {} })

  // @ts-ignore — learningProfile
  const rows = await prisma.learningProfile.findMany({ where: { internStaffId: { in: internIds } } })
  const profiles: Record<string, unknown> = {}
  for (const r of rows as { internStaffId: string; data: unknown; updatedAt: Date }[]) {
    profiles[r.internStaffId] = { data: r.data, updatedAt: r.updatedAt }
  }
  return NextResponse.json({ profiles })
}
