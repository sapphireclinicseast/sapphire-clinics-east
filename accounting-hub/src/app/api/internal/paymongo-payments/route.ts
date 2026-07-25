/**
 * GET /api/internal/paymongo-payments
 *
 * Read-only internal endpoint consumed by the Aura Health Institute admin
 * console (HR Platform) so the main admin can see PayMongo payment history
 * without leaving that site. Returns every PayMongo transaction with the
 * same fields the /paymongo page shows, plus a derived remitted flag and
 * totals. The PayMongo secret key never leaves this app.
 *
 * Auth: Authorization: Bearer ${TELETHERAPY_INTERNAL_API_KEY}
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function verifyKey(req: NextRequest): boolean {
  const key = process.env.TELETHERAPY_INTERNAL_API_KEY
  if (!key) return false
  return req.headers.get('authorization') === `Bearer ${key}`
}

export async function GET(req: NextRequest) {
  if (!verifyKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await prisma.paymongoCheckout.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true, referenceCode: true, description: true, branch: true,
      amount: true, status: true, fee: true, netAmount: true,
      paidAt: true, payoutId: true, livemode: true, createdAt: true,
    },
  })

  const payments = rows.map(r => {
    const amount = Number(r.amount || 0)
    const fee = r.fee != null ? Number(r.fee) : null
    const net = r.netAmount != null ? Number(r.netAmount) : (fee != null ? amount - fee : null)
    // PAID money is either still in PayMongo's clearing balance or already
    // remitted to our bank (payoutId gets tagged by the Payouts-API sync).
    const displayStatus =
      r.status !== 'PAID' ? r.status : (r.payoutId ? 'Remitted to Bank' : 'For Clearing')
    return {
      id: r.id,
      date: r.createdAt,
      reference: r.referenceCode,
      description: r.description,
      branch: r.branch,
      amount,
      fee,
      net,
      status: displayStatus,
      paidAt: r.paidAt,
      livemode: r.livemode,
    }
  })

  const paid = payments.filter(p => p.status === 'For Clearing' || p.status === 'Remitted to Bank')
  const totals = {
    charged: paid.reduce((s, p) => s + p.amount, 0),
    fees: paid.reduce((s, p) => s + (p.fee || 0), 0),
    net: paid.reduce((s, p) => s + (p.net || 0), 0),
    forClearing: paid.filter(p => p.status === 'For Clearing').reduce((s, p) => s + (p.net || 0), 0),
    remitted: paid.filter(p => p.status === 'Remitted to Bank').reduce((s, p) => s + (p.net || 0), 0),
  }

  return NextResponse.json({ payments, totals })
}
