// GET /api/decking/bookings — list patient-portal bookings for the front desk.
//
// Post-2026-05-18 self-service flow: the front desk only sees PAID and
// COMPLETED bookings. PENDING (= awaiting payment, patient-only state)
// stays out of this view. The patient-portal handles its own pre-payment
// UX; the Decking Module only acts on confirmed money.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') ?? undefined
  // status query param kept for backwards compat (callers can still ask for
  // a specific status), but the default scope is now PAID + COMPLETED only.
  const statusParam = searchParams.get('status') ?? undefined

  const where: Record<string, unknown> = {}
  if (branch && branch !== 'ALL') where.branch = branch
  if (statusParam) {
    where.status = statusParam
  } else {
    // 2026-05-24: also include PENDING so the front desk can see bookings
    // where the patient hasn't completed payment yet. They render with a
    // PENDING status badge and disabled action buttons in the UI. REJECTED
    // and CANCELLED stay hidden (dead-end states, not actionable).
    where.status = { in: ['PENDING', 'PAID', 'COMPLETED'] }
  }

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
    orderBy: [{ paidAt: 'desc' }, { date: 'asc' }, { startTime: 'asc' }],
    take: 500,
  })

  return NextResponse.json({ bookings })
}
