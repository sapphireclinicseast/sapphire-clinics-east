// POST /api/decking/bookings/[id]/recorded-in-accounting
//
// Front-desk action: mark that a booking's downpayment has been logged in
// accounting-hub AND (for non-teletherapy bookings) create the POS order
// directly so it appears in the cashier without a separate queue step.
//
// Teletherapy bookings are excluded from direct creation because the
// accounting-hub's PayMongo webhook already created a POS order when the
// patient paid via the static link.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = new Set([
  'ADMIN', 'MARKETING_ADMIN',
  'SBEA_ADMIN', 'SBGH_ADMIN',
  'SBEA_FRONT_DESK', 'SBGH_FRONT_DESK',
])

// Ops hub short codes → accounting hub Branch enum keys
const BRANCH_FULL: Record<string, string> = {
  SBEA: 'SANDBOX_EAST',
  SBGH: 'SANDBOX_GREENHILLS',
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: 'Front-desk access required' }, { status: 403 })
  }

  const { id } = await params

  const booking = await prisma.patientBooking.findUnique({
    where: { id },
    select: {
      id: true, status: true, isTeletherapy: true, branch: true,
      department: true, paidAt: true,
      patient: { select: { firstName: true, lastName: true } },
      payment: { select: { amount: true } },
      downpayment: true,
    },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status !== 'PAID' && booking.status !== 'COMPLETED') {
    return NextResponse.json(
      { error: `Booking is ${booking.status}; only PAID bookings can be marked accounted.` },
      { status: 409 },
    )
  }

  // For non-teletherapy bookings: create the POS downpayment order in
  // accounting-hub so it appears in the cashier ledger immediately.
  // Teletherapy payments already have a POS entry (created by the
  // accounting-hub's own PayMongo webhook when the patient paid).
  let orderNumber: number | null = null
  if (!booking.isTeletherapy) {
    const amount = Number(booking.payment?.amount ?? booking.downpayment ?? 0)
    if (amount > 0) {
      const accountingUrl =
        process.env.ACCOUNTING_HUB_URL ?? 'https://accounting.sapphireclinicseast.org'
      const apiKey = process.env.EXTERNAL_API_KEY ?? ''
      const transactionDate = (booking.paidAt ?? new Date()).toISOString().slice(0, 10)

      try {
        const resp = await fetch(
          `${accountingUrl}/api/internal/pos/portal-downpayment`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${apiKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              patientName: `${booking.patient.firstName} ${booking.patient.lastName}`.trim(),
              branch: BRANCH_FULL[booking.branch] ?? booking.branch,
              department: booking.department,
              downpaymentAmount: amount,
              transactionDate,
              referenceNumber: booking.id,
            }),
          },
        )

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          return NextResponse.json(
            { error: `Accounting Hub error: ${(err as { error?: string }).error ?? resp.status}` },
            { status: 502 },
          )
        }

        const result = await resp.json() as { ok: boolean; orderNumber?: number }
        orderNumber = result.orderNumber ?? null
      } catch (e) {
        console.error('[recorded-in-accounting] accounting-hub call failed:', e)
        return NextResponse.json(
          { error: 'Could not reach Accounting Hub — check ACCOUNTING_HUB_URL and EXTERNAL_API_KEY.' },
          { status: 502 },
        )
      }
    }
  }

  await prisma.patientBooking.update({
    where: { id },
    data: { accountingRecorded: true },
  })

  return NextResponse.json({ ok: true, ...(orderNumber !== null ? { orderNumber } : {}) })
}
