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

  return NextResponse.json({ bookings })
}
