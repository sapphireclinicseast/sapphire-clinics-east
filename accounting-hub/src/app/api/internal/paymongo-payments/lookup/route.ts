/**
 * GET /api/internal/paymongo-payments/lookup?ref=<externalRef>
 *
 * Read-only internal endpoint consumed by the ops hub's Decking Module. Given the
 * externalRef a payer's origin flow attached to a checkout (today: the ops-hub
 * teletherapy PatientBooking id passed as ?ref= on the public pay page), returns
 * every matching PaymongoCheckout with enough state for the caller to decide
 * whether the money has actually been recorded in the books:
 *
 *   status/livemode/paidAt — was real money received?
 *   recorded              — has a cashier recorded it (POS order via Convert-to-
 *                           Order, or an advance-wallet load)? A paid checkout
 *                           with recorded=false is still sitting in the
 *                           Convert-to-Order queue and has no order behind it.
 *
 * Auth: Authorization: Bearer ${EXTERNAL_API_KEY} — same shared key as the other
 * /api/internal endpoints.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function verifyKey(req: NextRequest): boolean {
  const key = process.env.EXTERNAL_API_KEY
  if (!key) return false
  return req.headers.get('authorization') === `Bearer ${key}`
}

export async function GET(req: NextRequest) {
  if (!verifyKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ref = String(new URL(req.url).searchParams.get('ref') || '').trim()
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(ref)) {
    return NextResponse.json({ error: 'ref is required' }, { status: 400 })
  }

  const rows = await prisma.paymongoCheckout.findMany({
    where: { externalRef: ref },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true, referenceCode: true, status: true, livemode: true,
      amount: true, paidAt: true, itemName: true,
      customerFirstName: true, customerLastName: true, customerEmail: true,
      orderId: true, advanceWalletId: true, convertedAt: true,
    },
  })

  return NextResponse.json({
    payments: rows.map(r => ({
      id: r.id,
      referenceCode: r.referenceCode,
      status: r.status,
      livemode: r.livemode,
      amount: Number(r.amount),
      paidAt: r.paidAt,
      itemName: r.itemName,
      payerName: [r.customerFirstName, r.customerLastName].filter(Boolean).join(' '),
      payerEmail: r.customerEmail,
      recorded: !!(r.orderId || r.advanceWalletId || r.convertedAt),
      convertedAt: r.convertedAt,
    })),
  })
}
