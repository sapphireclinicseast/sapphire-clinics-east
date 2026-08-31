// GET /api/internal/cancellation-fees?from=YYYY-MM-DD&branches=SANDBOX_EAST,...
//
// Cancellation-fee lines actually charged on POS orders, so the Operations Hub
// can show front desk whether the fee on a given cancellation has been paid.
// Without this they have to cross-check the POS by hand, and in practice they
// don't — patients get chased for fees they already settled, or never chased.
//
// Auth: Authorization: Bearer EXTERNAL_API_KEY (same inter-hub key and shape as
// /api/internal/dept-patient-history).
//
// There is no "cancellation fee" type in this schema — it is an ordinary
// service line whose NAME says what it is. So the match is on OrderItem.name,
// and the matched name is returned with every row: the caller shows it, and a
// wrong pattern is then visible in the UI rather than silently producing
// "unpaid" everywhere. FEE_NAME_PATTERN overrides the default without a deploy.
//
// Returns { patterns, rows: [{ patientId, patientName, branch, orderNumber,
//           paidAt, amount, lineName }] }

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function verifyKey(req: NextRequest): boolean {
  const key = process.env.EXTERNAL_API_KEY
  if (!key) return false
  return req.headers.get('authorization') === `Bearer ${key}`
}

// Substrings that mark a line as a cancellation fee, matched case-insensitively.
// Deliberately broad: "CANCELLATION FEE", "Cancellation Charge", "LATE CANCEL
// FEE" all qualify. Set FEE_NAME_PATTERN (comma-separated) to replace this.
const DEFAULT_PATTERNS = ['cancellation fee', 'cancelation fee', 'cancel fee', 'cancellation charge']

export async function GET(req: NextRequest) {
  if (!verifyKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const patterns = (process.env.FEE_NAME_PATTERN ?? '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const active = patterns.length > 0 ? patterns : DEFAULT_PATTERNS

  // Default to a year back: the caller only cares about a rolling 6-month
  // window, but a fee can be settled well after the cancellation it belongs to.
  const fromParam = searchParams.get('from')
  const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)

  const branches = (searchParams.get('branches') ?? '').split(',').map(s => s.trim()).filter(Boolean)

  const items = await prisma.orderItem.findMany({
    where: {
      OR: active.map(p => ({ name: { contains: p, mode: 'insensitive' as const } })),
      order: {
        // VOIDED is excluded: a voided order is not money collected, and
        // treating it as paid would clear a fee that is still owed.
        status: { in: ['COMPLETED', 'REOPENED'] },
        transactionDate: { gte: from },
        ...(branches.length > 0 ? { branch: { in: branches } } : {}),
      },
    },
    select: {
      name: true,
      lineTotal: true,
      order: {
        select: {
          orderNumber: true, branch: true, patientId: true, patientName: true,
          transactionDate: true, paymentDate: true,
        },
      },
    },
    orderBy: { order: { transactionDate: 'asc' } },
  })

  const rows = items.map(it => ({
    patientId: it.order.patientId,
    patientName: it.order.patientName,
    branch: it.order.branch,
    orderNumber: it.order.orderNumber,
    // paymentDate is when cash was actually collected; transactionDate is the
    // session's date and is always set, so it's the fallback.
    paidAt: (it.order.paymentDate ?? it.order.transactionDate).toISOString(),
    amount: Number(it.lineTotal),
    lineName: it.name,
  }))

  return NextResponse.json({ patterns: active, rows })
}
