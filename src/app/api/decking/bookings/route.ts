// GET /api/decking/bookings — list patient-portal bookings for the front desk.
// Filterable by branch + status.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') ?? undefined
  const status = searchParams.get('status') ?? undefined

  const where: Record<string, unknown> = {}
  if (branch) where.branch = branch
  if (status) where.status = status

  const bookings = await prisma.patientBooking.findMany({
    where,
    include: {
      patient: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      },
      staff: {
        select: { id: true, firstName: true, lastName: true, department: true, branch: true },
      },
      payment: {
        select: { id: true, status: true, checkoutUrl: true, amount: true, paidAt: true },
      },
    },
    orderBy: [{ status: 'asc' }, { date: 'asc' }, { startTime: 'asc' }],
    take: 500,
  })

  // Enrich with staff lookup for alternate choices.
  const altStaffIds = new Set<string>()
  for (const b of bookings) {
    const alts = (b.alternateChoices as Array<{ staffId?: string }> | null) ?? null
    if (Array.isArray(alts)) alts.forEach((a) => a.staffId && altStaffIds.add(a.staffId))
  }
  const altStaff = altStaffIds.size
    ? await prisma.staff.findMany({
        where: { id: { in: Array.from(altStaffIds) } },
        select: { id: true, firstName: true, lastName: true },
      })
    : []
  const staffById = new Map(altStaff.map((s) => [s.id, s]))

  const enriched = bookings.map((b) => ({
    ...b,
    alternateChoices: Array.isArray(b.alternateChoices)
      ? (b.alternateChoices as Array<{ staffId: string; date: string; startTime: string; endTime: string }>).map((a) => {
          const s = staffById.get(a.staffId)
          return {
            ...a,
            initials: s ? `${s.firstName?.[0] ?? '?'}${s.lastName?.[0] ?? '?'}`.toUpperCase() : '??',
          }
        })
      : null,
  }))

  return NextResponse.json({ bookings: enriched })
}
