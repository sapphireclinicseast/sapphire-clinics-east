// POST /api/decking/bookings/[id]/recorded-in-accounting
//
// Front-desk action: mark that a booking's downpayment has been logged in
// accounting-hub AND (for non-teletherapy bookings) create the POS order
// directly so it appears in the cashier without a separate queue step.
//
// Teletherapy bookings pay through the accounting-hub's static PayMongo link,
// which does NOT create a POS order by itself — the payment sits in the
// Convert-to-Order queue until a cashier records it. So for tele bookings this
// route first verifies against the accounting-hub (via the checkout's
// externalRef = this booking id) that a paid, live-mode payment exists AND has
// been recorded; only then does it set accountingRecorded. Body { force: true }
// skips the check for bookings that predate the linkage (payer paid without
// ?ref=) after the front desk verified manually.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = new Set([
  'ADMIN', 'MARKETING_ADMIN',
  'AHEA_ADMIN', 'AHGH_ADMIN',
  'AHEA_FRONT_DESK', 'AHGH_FRONT_DESK',
])

// Ops hub short codes → accounting hub Branch enum keys
const BRANCH_FULL: Record<string, string> = {
  SBEA: 'SANDBOX_EAST',
  SBGH: 'SANDBOX_GREENHILLS',
}

export async function POST(
  req: NextRequest,
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

  const accountingUrl =
    process.env.ACCOUNTING_HUB_URL ?? 'https://accounting.sapphireclinicseast.org'
  const apiKey = process.env.EXTERNAL_API_KEY ?? ''

  // Teletherapy: the static pay link does NOT create a POS order — verify with
  // the accounting-hub that the payment exists and was recorded (converted to an
  // order or loaded into an advance wallet) before asserting accountingRecorded.
  // force=true skips this for pre-linkage bookings the front desk verified by hand.
  let force = false
  try { force = !!((await req.json()) as { force?: boolean })?.force } catch { /* no body */ }

  if (booking.isTeletherapy && !force) {
    let payments: {
      status: string; livemode: boolean; recorded: boolean
      payerName?: string; amount?: number
    }[]
    try {
      const resp = await fetch(
        `${accountingUrl}/api/internal/paymongo-payments/lookup?ref=${encodeURIComponent(id)}`,
        { headers: { authorization: `Bearer ${apiKey}` } },
      )
      if (!resp.ok) {
        return NextResponse.json(
          { error: `Accounting Hub payment lookup failed (${resp.status}). If it keeps failing, verify the payment there manually and use "mark anyway".` },
          { status: 502 },
        )
      }
      payments = ((await resp.json()) as { payments?: typeof payments }).payments ?? []
    } catch (e) {
      console.error('[recorded-in-accounting] accounting-hub lookup failed:', e)
      return NextResponse.json(
        { error: 'Could not reach Accounting Hub — check ACCOUNTING_HUB_URL and EXTERNAL_API_KEY.' },
        { status: 502 },
      )
    }

    const paid = payments.filter(p => p.status === 'PAID' && p.livemode)
    const recorded = paid.find(p => p.recorded)
    if (!recorded) {
      return paid.length > 0
        ? NextResponse.json(
            {
              error: 'The PayMongo payment for this booking is received but NOT yet recorded — convert it to an order in Accounting Hub POS (PayMongo → Convert to Order) first.',
              code: 'NOT_CONVERTED',
            },
            { status: 409 },
          )
        : NextResponse.json(
            {
              error: 'No PayMongo payment is linked to this booking. Either the patient has not paid, or they paid before booking-linked pay links existed — verify in Accounting Hub manually.',
              code: 'NO_PAYMENT',
            },
            { status: 409 },
          )
    }
  }

  // For non-teletherapy bookings: create the POS downpayment order in
  // accounting-hub so it appears in the cashier ledger immediately.
  let orderNumber: number | null = null
  if (!booking.isTeletherapy) {
    const amount = Number(booking.payment?.amount ?? booking.downpayment ?? 0)
    if (amount > 0) {
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
