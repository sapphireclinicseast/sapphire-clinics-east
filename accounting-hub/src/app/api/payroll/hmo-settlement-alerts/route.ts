import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'VIEWER']
const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

const round2 = (n: number) => Math.round(n * 100) / 100

interface SessionRow {
  entry_id: string
  cutoff: string
  status: string
  branch: string
  consultant_id: string
  consultant: string
  unit_pay_id: string | null
  unit_pay_name: string | null
  unit_amount: number
  qty: number
  order_id: string
}

/**
 * GET /api/payroll/hmo-settlement-alerts
 * PF released at the old (billed) amount on sessions later decreased with
 * "Decrease due to HMO Payment". Only finalized/locked cutoffs are flagged — a
 * draft cutoff re-reads the order's revised net when it is regenerated. The
 * policy amount re-applies the consultant's own unit-pay rule (threshold →
 * reduced rate) to the order's net after the decrease.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const settlements = await prisma.orderHmoSettlement.findMany({
    where: { pfResolvedAt: null },
    include: { order: { select: { id: true, orderNumber: true, transactionDate: true, patientName: true, netAmount: true } } },
    orderBy: { createdAt: 'asc' },
  })
  if (!settlements.length) return NextResponse.json({ alerts: [] })

  const orderIds = [...new Set(settlements.map(s => s.orderId))]
  const rows = await prisma.$queryRaw<SessionRow[]>`
    SELECT pe.id AS entry_id, pe."cutoffPeriod" AS cutoff, pe.status, pe.branch, pe."consultantId" AS consultant_id, c.name AS consultant,
           it->>'unitPayId' AS unit_pay_id, it->>'unitPayName' AS unit_pay_name,
           (it->>'unitAmount')::float8 AS unit_amount, COALESCE((s->>'quantity')::float8, 1) AS qty, s->>'orderId' AS order_id
    FROM "PayrollEntry" pe
    JOIN "Consultant" c ON c.id = pe."consultantId",
         jsonb_array_elements(pe.items::jsonb) it,
         jsonb_array_elements(COALESCE(it->'sessions', '[]'::jsonb)) s
    WHERE s->>'orderId' = ANY(${orderIds}) AND pe.status <> 'DRAFT'`
  if (!rows.length) return NextResponse.json({ alerts: [] })

  const rates = await prisma.consultantUnitPay.findMany({
    where: { OR: rows.filter(r => r.unit_pay_id).map(r => ({ consultantId: r.consultant_id, unitPayId: r.unit_pay_id as string })) },
  })
  const rateOf = new Map(rates.map(r => [`${r.consultantId}|${r.unitPayId}`, r]))
  const latestByOrder = new Map<string, (typeof settlements)[number]>()
  for (const s of settlements) latestByOrder.set(s.orderId, s)

  const alerts = []
  for (const r of rows) {
    const s = latestByOrder.get(r.order_id)
    const rate = r.unit_pay_id ? rateOf.get(`${r.consultant_id}|${r.unit_pay_id}`) : undefined
    if (!s || !rate) continue
    const override = (rate.branchAmounts as Record<string, unknown> | null)?.[r.branch]
    const full = override != null && Number.isFinite(Number(override)) ? Number(override) : Number(rate.amount)
    const basis = Number(s.order.netAmount)
    const reduced = rate.thresholdEnabled && rate.thresholdAmount != null && rate.reducedAmount != null && basis < Number(rate.thresholdAmount)
    const policy = reduced ? Number(rate.reducedAmount) : full
    const overpaid = round2((Number(r.unit_amount) - policy) * Number(r.qty))
    if (overpaid <= 0.005) continue
    alerts.push({
      settlementId: s.id,
      orderId: s.orderId,
      orderNumber: s.order.orderNumber,
      sessionDate: s.order.transactionDate,
      patientName: s.order.patientName,
      billedAmount: Number(s.billedAmount),
      paidAmount: Number(s.paidAmount),
      consultant: r.consultant,
      cutoffPeriod: r.cutoff,
      entryStatus: r.status,
      unitPayName: r.unit_pay_name,
      quantity: Number(r.qty),
      pfPaid: Number(r.unit_amount),
      pfPolicy: policy,
      overpaid,
    })
  }
  return NextResponse.json({ alerts })
}

/**
 * PATCH /api/payroll/hmo-settlement-alerts
 * Body: { settlementId: string, note?: string } — the overpaid PF has been
 * deducted (or waived); clears the alert.
 */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { settlementId, note } = await req.json()
  if (!settlementId) return NextResponse.json({ error: 'settlementId is required' }, { status: 400 })
  const existing = await prisma.orderHmoSettlement.findUnique({ where: { id: settlementId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.orderHmoSettlement.update({
    where: { id: settlementId },
    data: {
      pfResolvedAt: new Date(),
      pfResolvedById: session.user.id as string,
      pfResolvedNote: typeof note === 'string' && note.trim() ? note.trim().slice(0, 300) : `Deducted — ${(session.user.name as string) || 'payroll'}`,
    },
  })
  return NextResponse.json({ ok: true })
}
