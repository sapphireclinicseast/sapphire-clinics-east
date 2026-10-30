import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'VIEWER']
const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

const round2 = (n: number) => Math.round(n * 100) / 100
// Order branch → the payroll branch code a rate's branchAmounts override is keyed by.
const ORDER_TO_PAYROLL_BRANCH: Record<string, string> = {
  SANDBOX_EAST: 'SBEA', SANDBOX_GREENHILLS: 'SBGH', VERDANA_STORE: 'VERDANA', AURA_INSTITUTE: 'AHI',
}
const CUTOFF_RE = /^\d{4}-(0[1-9]|1[0-2])-[12]$/
// The deduction cutoff rides at the head of pfResolvedNote: "cutoff:2026-11-1 — note".
const NOTE_RE = /^cutoff:(\d{4}-\d{2}-[12])(?: — ([\s\S]*))?$/
function parseResolution(note: string | null) {
  const m = note ? NOTE_RE.exec(note) : null
  return m ? { cutoff: m[1], note: m[2] || null } : { cutoff: null, note }
}

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

interface Rate {
  amount: unknown
  thresholdEnabled: boolean | null
  thresholdAmount: unknown
  reducedAmount: unknown
  branchAmounts: unknown
}

/** The consultant's unit pay for one session at a given threshold basis — the
 *  same rule payroll/generate applies (branch override, then threshold → reduced). */
function rateAt(rate: Rate, branch: string, basis: number) {
  const override = (rate.branchAmounts as Record<string, unknown> | null)?.[branch]
  const full = override != null && Number.isFinite(Number(override)) ? Number(override) : Number(rate.amount)
  const reduced = rate.thresholdEnabled === true && rate.thresholdAmount != null && rate.reducedAmount != null &&
    basis < Number(rate.thresholdAmount)
  return reduced ? Number(rate.reducedAmount) : full
}

/**
 * GET /api/payroll/hmo-settlement-alerts[?settled=1]
 * PF released at the old (billed) amount on sessions later decreased with
 * "Decrease due to HMO Payment". Default = still to recover; ?settled=1 adds
 * the ones already tagged with the cutoff they were deducted in.
 *
 * Two sources:
 * - HUB: the session sits on a finalized/locked PayrollEntry — PF actually paid
 *   is read from the entry and compared with the rule at the revised amount.
 *   A draft cutoff re-reads the order's revised net when regenerated, so it is
 *   never flagged.
 * - OUTSIDE_HUB: no PayrollEntry carries the session (Jan–Mar 2026 payroll was
 *   run outside the hub). PF paid is taken as the rule at the billed amount,
 *   compared with the rule at the HMO-paid amount — to be confirmed against
 *   the payslip.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const includeSettled = new URL(req.url).searchParams.get('settled') === '1'

  const settlements = await prisma.orderHmoSettlement.findMany({
    where: includeSettled ? {} : { pfResolvedAt: null },
    include: {
      order: {
        select: {
          id: true, orderNumber: true, transactionDate: true, patientName: true, netAmount: true, branch: true, clinicianName: true,
          payments: { select: { method: true } },
          items: {
            select: {
              name: true, quantity: true, lineTotal: true,
              service: { select: { unitPayId: true, unitPayEnabled: true, department: true, hmoPaysClinicianDirect: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
  if (!settlements.length) return NextResponse.json({ alerts: [] })

  const latestByOrder = new Map<string, (typeof settlements)[number]>()
  for (const s of settlements) latestByOrder.set(s.orderId, s)
  const orderIds = [...latestByOrder.keys()]

  // Every payroll line carrying these sessions, drafts included — a draft
  // still means the session is the hub's to pay, so it is never "outside".
  const rows = await prisma.$queryRaw<SessionRow[]>`
    SELECT pe.id AS entry_id, pe."cutoffPeriod" AS cutoff, pe.status, pe.branch, pe."consultantId" AS consultant_id, c.name AS consultant,
           it->>'unitPayId' AS unit_pay_id, it->>'unitPayName' AS unit_pay_name,
           (it->>'unitAmount')::float8 AS unit_amount, COALESCE((s->>'quantity')::float8, 1) AS qty, s->>'orderId' AS order_id
    FROM "PayrollEntry" pe
    JOIN "Consultant" c ON c.id = pe."consultantId",
         jsonb_array_elements(pe.items::jsonb) it,
         jsonb_array_elements(COALESCE(it->'sessions', '[]'::jsonb)) s
    WHERE s->>'orderId' = ANY(${orderIds})`
  const inHub = new Set(rows.map(r => r.order_id))

  const resolverIds = [...new Set(settlements.map(s => s.pfResolvedById).filter((id): id is string => !!id))]
  const resolvers = resolverIds.length
    ? await prisma.user.findMany({ where: { id: { in: resolverIds } }, select: { id: true, name: true } })
    : []
  const resolverName = new Map(resolvers.map(u => [u.id, u.name || '']))

  const base = (s: (typeof settlements)[number]) => ({
    settlementId: s.id,
    orderId: s.orderId,
    orderNumber: s.order.orderNumber,
    sessionDate: s.order.transactionDate,
    patientName: s.order.patientName,
    billedAmount: Number(s.billedAmount),
    paidAmount: Number(s.paidAmount),
    settled: !!s.pfResolvedAt,
    deductedCutoff: parseResolution(s.pfResolvedNote).cutoff,
    resolvedAt: s.pfResolvedAt,
    resolvedBy: s.pfResolvedById ? resolverName.get(s.pfResolvedById) || null : null,
    resolvedNote: parseResolution(s.pfResolvedNote).note,
  })
  const alerts = []

  /* HUB — finalized/locked payroll lines */
  const hubRows = rows.filter(r => r.status !== 'DRAFT' && r.unit_pay_id)
  const hubRates = hubRows.length
    ? await prisma.consultantUnitPay.findMany({
        where: { OR: hubRows.map(r => ({ consultantId: r.consultant_id, unitPayId: r.unit_pay_id as string })) },
      })
    : []
  const hubRateOf = new Map(hubRates.map(r => [`${r.consultantId}|${r.unitPayId}`, r]))
  for (const r of hubRows) {
    const s = latestByOrder.get(r.order_id)
    const rate = hubRateOf.get(`${r.consultant_id}|${r.unit_pay_id}`)
    if (!s || !rate) continue
    const policy = rateAt(rate, r.branch, Number(s.order.netAmount))
    const overpaid = round2((Number(r.unit_amount) - policy) * Number(r.qty))
    if (overpaid <= 0.005) continue
    alerts.push({
      ...base(s), source: 'HUB' as const,
      consultant: r.consultant, cutoffPeriod: r.cutoff, entryStatus: r.status, unitPayName: r.unit_pay_name,
      quantity: Number(r.qty), pfPaid: Number(r.unit_amount), pfPolicy: policy, overpaid,
    })
  }

  /* OUTSIDE_HUB — sessions no payroll entry carries */
  const outside = [...latestByOrder.values()].filter(s => !inHub.has(s.orderId) && s.order.clinicianName)
  if (outside.length) {
    const names = [...new Set(outside.map(s => s.order.clinicianName!.trim().toUpperCase()))]
    const consultants = await prisma.consultant.findMany({
      where: { OR: names.map(n => ({ name: { equals: n, mode: 'insensitive' as const } })) },
      select: {
        id: true, name: true,
        unitPayRates: { include: { unitPay: { select: { name: true } } } },
      },
    })
    const byName = new Map(consultants.map(c => [c.name.trim().toUpperCase(), c]))
    for (const s of outside) {
      const c = byName.get(s.order.clinicianName!.trim().toUpperCase())
      if (!c) continue
      const branch = ORDER_TO_PAYROLL_BRANCH[s.order.branch] || s.order.branch
      const hmoPaid = s.order.payments.some(p => p.method === 'HMO')
      // Threshold basis as payroll builds it: order net less lines paid by
      // their own non-threshold unit pay. Before = net + the decrease.
      let deductions = 0
      for (const it of s.order.items) {
        if (!it.service?.unitPayId || it.service.unitPayEnabled === false) continue
        const r = c.unitPayRates.find(x => x.unitPayId === it.service!.unitPayId)
        if (r && !r.disabled && !r.thresholdEnabled) deductions += Number(it.lineTotal)
      }
      const after = Number(s.order.netAmount) - deductions
      const before = after + Number(s.difference)
      const lines: { rate: (typeof c.unitPayRates)[number]; quantity: number }[] = []
      for (const it of s.order.items) {
        if (!it.service?.unitPayId || it.service.unitPayEnabled === false) continue
        const rate = c.unitPayRates.find(x => x.unitPayId === it.service!.unitPayId)
        if (!rate || rate.disabled) continue
        const dept = String(it.service.department || '').toUpperCase()
        if (hmoPaid && (dept === 'MD' || it.service.hmoPaysClinicianDirect)) continue // HMO medical carries no unit pay
        lines.push({ rate, quantity: it.quantity })
      }
      // QuickBooks-imported sessions (Jan–Mar 2026) sit on a generic "QB Import"
      // service with no unit pay, so nothing above matched. The PF rule that can
      // move with the HMO amount is the consultant's threshold rate (BASIC
      // SESSION: ≥ 1,800 full, else reduced) — apply that once per session.
      if (!lines.length && !s.order.items.some(it => it.service?.unitPayId)) {
        const thresholdRates = c.unitPayRates.filter(r => !r.disabled && r.thresholdEnabled)
        if (thresholdRates.length === 1) lines.push({ rate: thresholdRates[0], quantity: 1 })
      }
      for (const { rate, quantity } of lines) {
        const paid = rateAt(rate, branch, before)
        const policy = rateAt(rate, branch, after)
        const overpaid = round2((paid - policy) * quantity)
        if (overpaid <= 0.005) continue
        alerts.push({
          ...base(s), source: 'OUTSIDE_HUB' as const,
          consultant: c.name, cutoffPeriod: null, entryStatus: null, unitPayName: rate.unitPay.name,
          quantity, pfPaid: paid, pfPolicy: policy, overpaid,
        })
      }
    }
  }

  alerts.sort((a, b) => a.consultant.localeCompare(b.consultant) || String(a.sessionDate).localeCompare(String(b.sessionDate)))
  return NextResponse.json({ alerts })
}

/**
 * PATCH /api/payroll/hmo-settlement-alerts
 * Body: { settlementId, cutoff: "2026-11-1", note? } — the overpaid PF was
 * deducted in that payroll cutoff; the alert clears.
 * Body: { settlementId, undo: true } — reopen a mis-tagged one.
 */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { settlementId, cutoff, note, undo } = await req.json()
  if (!settlementId) return NextResponse.json({ error: 'settlementId is required' }, { status: 400 })
  const existing = await prisma.orderHmoSettlement.findUnique({ where: { id: settlementId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (undo) {
    await prisma.orderHmoSettlement.update({
      where: { id: settlementId },
      data: { pfResolvedAt: null, pfResolvedById: null, pfResolvedNote: null },
    })
    return NextResponse.json({ ok: true })
  }
  if (typeof cutoff !== 'string' || !CUTOFF_RE.test(cutoff)) {
    return NextResponse.json({ error: 'Choose the payroll cutoff the PF was deducted in' }, { status: 400 })
  }
  await prisma.orderHmoSettlement.update({
    where: { id: settlementId },
    data: {
      pfResolvedAt: new Date(),
      pfResolvedById: session.user.id as string,
      pfResolvedNote: `cutoff:${cutoff}${typeof note === 'string' && note.trim() ? ` — ${note.trim().slice(0, 280)}` : ''}`,
    },
  })
  return NextResponse.json({ ok: true })
}
