// GET /api/accounts-receivable/revised-sessions
//
// Accounts Receivable → Revised Session Amount. Every HMO session whose amount
// was decreased to what the HMO actually paid — one row per OrderHmoSettlement,
// whether it was made from POS → Order History or from AR → Record Payment
// (both go through /api/pos/orders/[id]/hmo-settlement). Read-only: revising is
// done in those two places, not here.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enforceBranch } from '@/lib/branch-scope'

const READ_ROLES = [
  'ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER',
  'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER',
  'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'PAYROLL_OFFICER',
]

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { role?: string; branch?: string; branches?: string[] }
  if (!READ_ROLES.includes(user.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = new URL(req.url).searchParams
  const branch = enforceBranch(user.branch, user.branches, sp.get('branch')) ?? (sp.get('branch') || '')

  const settlements = await prisma.orderHmoSettlement.findMany({
    where: branch ? { order: { branch } } : {},
    include: {
      order: {
        select: {
          id: true, orderNumber: true, transactionDate: true, branch: true,
          patientName: true, clinicianName: true,
          items: { select: { name: true } },
        },
      },
    },
  })

  const walletIds = [...new Set(settlements.map(s => s.walletId).filter((id): id is string => !!id))]
  const wallets = walletIds.length
    ? await prisma.digitalWallet.findMany({ where: { id: { in: walletIds } }, select: { id: true, patientName: true } })
    : []
  const hmoOf = new Map(wallets.map(w => [w.id, w.patientName || '']))

  const rows = settlements.map(s => ({
    id: s.id,
    orderId: s.order.id,
    orderNumber: s.order.orderNumber,
    date: s.order.transactionDate.toISOString(),
    branch: s.order.branch,
    service: s.order.items.map(i => i.name).join(', '),
    patient: s.order.patientName || '',
    clinician: s.order.clinicianName || '',
    hmo: (s.walletId && hmoOf.get(s.walletId)) || '',
    originalAmount: Number(s.billedAmount),
    revisedAmount: Number(s.paidAmount),
    difference: Number(s.difference),
    reference: s.reference,
    note: s.note,
    revisedBy: s.createdByName,
    revisedAt: s.createdAt.toISOString(),
  })).sort((a, b) => b.date.localeCompare(a.date) || b.orderNumber - a.orderNumber)

  return NextResponse.json({ rows })
}
