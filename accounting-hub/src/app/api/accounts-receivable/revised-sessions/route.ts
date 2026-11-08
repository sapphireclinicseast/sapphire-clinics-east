// GET /api/accounts-receivable/revised-sessions
//
// Accounts Receivable → Session Adjustments (was "Revised Session Amount";
// renamed by Hannah 2026-11-09 so it also covers voided sessions). Two kinds of
// HMO session land here, one row per OrderHmoSettlement:
// - REVISED: the amount was decreased to what the HMO actually paid, from
//   POS → Order History or AR → Record Payment (both go through
//   /api/pos/orders/[id]/hmo-settlement).
// - VOIDED: the HMO order was voided (lib/hmo-session-void records the row at
//   the void) — e.g. a confirmed duplicate session.
// Payroll roles also see the PF released on each session that is still to be
// recovered (or already was), from the same alerts Payroll → HMO PF
// Adjustments uses. Read-only: adjusting is done in POS / Record Payment.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enforceBranch } from '@/lib/branch-scope'
import { HMO_VOID_REF, decreaseRowsOnly } from '@/lib/hmo-session-void'
import { hmoPfAlerts, voidReentries } from '@/lib/payroll/hmo-pf-alerts'

const READ_ROLES = [
  'ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER',
  'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER',
  'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'PAYROLL_OFFICER',
]
// Same roles as Payroll → HMO PF Adjustments.
const PF_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'VIEWER']

const round2 = (n: number) => Math.round(n * 100) / 100

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { role?: string; branch?: string; branches?: string[] }
  if (!READ_ROLES.includes(user.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = new URL(req.url).searchParams
  const branch = enforceBranch(user.branch, user.branches, sp.get('branch')) ?? (sp.get('branch') || '')
  const branchWhere = branch ? { branch } : {}

  const settlements = await prisma.orderHmoSettlement.findMany({
    where: {
      OR: [
        // A decrease on an order that still stands. Once the order is voided
        // its void row below replaces the decrease.
        { AND: [{ order: { status: { not: 'VOIDED' }, ...branchWhere } }, decreaseRowsOnly] },
        { reference: HMO_VOID_REF, order: { status: 'VOIDED', ...branchWhere } },
      ],
    },
    include: {
      order: {
        select: {
          id: true, orderNumber: true, transactionDate: true, branch: true,
          patientName: true, clinicianName: true, status: true,
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

  // PF still owed back / already deducted, per adjustment row.
  const showPf = PF_ROLES.includes(user.role ?? '')
  const pfBySettlement = new Map<string, { toRecover: number; recovered: number; cutoffs: string[]; consultants: string[]; outsideHub: boolean }>()
  if (showPf && settlements.length) {
    const alerts = await hmoPfAlerts(true).catch(err => { console.error('[AR] session adjustments PF lookup failed:', err); return [] })
    for (const a of alerts) {
      const cur = pfBySettlement.get(a.settlementId) || { toRecover: 0, recovered: 0, cutoffs: [], consultants: [], outsideHub: false }
      if (a.settled) cur.recovered = round2(cur.recovered + a.overpaid)
      else cur.toRecover = round2(cur.toRecover + a.overpaid)
      if (a.settled && a.deductedCutoff && !cur.cutoffs.includes(a.deductedCutoff)) cur.cutoffs.push(a.deductedCutoff)
      if (!cur.consultants.includes(a.consultant)) cur.consultants.push(a.consultant)
      if (a.source === 'OUTSIDE_HUB') cur.outsideHub = true
      pfBySettlement.set(a.settlementId, cur)
    }
  }

  // A voided session re-entered as a corrected order (same patient, day and
  // clinician, on no payslip) keeps its PF — say so on the row.
  const voids = settlements.filter(s => s.reference === HMO_VOID_REF)
  const reentered = voids.length
    ? await voidReentries(voids.map(s => ({ orderId: s.orderId, patientName: s.order.patientName, clinicianName: s.order.clinicianName, transactionDate: s.order.transactionDate })))
        .catch(err => { console.error('[AR] session adjustments re-entry lookup failed:', err); return new Map<string, number[]>() })
    : new Map<string, number[]>()

  const rows = settlements.map(s => ({
    id: s.id,
    kind: s.reference === HMO_VOID_REF ? 'VOIDED' as const : 'REVISED' as const,
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
    reference: s.reference === HMO_VOID_REF ? null : s.reference,
    note: s.note,
    revisedBy: s.createdByName,
    revisedAt: s.createdAt.toISOString(),
    pf: showPf ? (pfBySettlement.get(s.id) ?? null) : undefined,
    reenteredAs: reentered.get(s.orderId) ?? [],
  })).sort((a, b) => b.date.localeCompare(a.date) || b.orderNumber - a.orderNumber)

  return NextResponse.json({ rows, showPf })
}
