// Resolves the current application window from UgatApplicationCycle rows.
// A cycle is "open" when now is within [opensAt, closesAt]. When nothing is
// open, we surface the next upcoming cycle so the portal can say when it opens.

import { prisma } from './prisma'

export interface UgatWindow {
  open: boolean
  academicYear?: string
  opensAt?: Date
  closesAt?: Date
  nextAcademicYear?: string
  nextOpensAt?: Date
}

export async function getWindow(): Promise<UgatWindow> {
  const now = new Date()
  const open = await prisma.ugatApplicationCycle.findFirst({
    where: { opensAt: { lte: now }, closesAt: { gte: now } },
    orderBy: { closesAt: 'asc' },
  })
  if (open) return { open: true, academicYear: open.academicYear, opensAt: open.opensAt, closesAt: open.closesAt }

  const next = await prisma.ugatApplicationCycle.findFirst({
    where: { opensAt: { gt: now } },
    orderBy: { opensAt: 'asc' },
  })
  return { open: false, nextAcademicYear: next?.academicYear, nextOpensAt: next?.opensAt }
}
