// PF released at a session's billed amount before the sale was decreased to what
// the HMO paid ("Decrease due to HMO Payment") — shared by Payroll → HMO PF
// Adjustments, the bell, and the payslip generator's automatic PF recovery lines.

import { prisma } from '@/lib/prisma'
import { ORDER_TO_PAYROLL_BRANCH, rateAt } from '@/lib/payroll/pf-price'
import { HMO_VOID_REF } from '@/lib/hmo-session-void'

const round2 = (n: number) => Math.round(n * 100) / 100
// The deduction cutoff rides at the head of pfResolvedNote: "cutoff:2026-11-1 — note".
const NOTE_RE = /^cutoff:(\d{4}-\d{2}-[12])(?: — ([\s\S]*))?$/
export function parseResolution(note: string | null) {
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

export type HmoPfAlert = Awaited<ReturnType<typeof hmoPfAlerts>>[number]

/**
 * hmoPfAlerts(includeSettled)
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
 *
 * A VOIDED HMO session (its HMO_VOID_REF row, see lib/hmo-session-void) owes
 * back all the PF released on it: the rule after the void is zero. When an
 * earlier decrease on the same order was already deducted, only the PF still
 * held after that decrease is due, so nothing is recovered twice. Voids are
 * HUB-only (a void says nothing about what an outside-hub payroll paid), and a
 * void that was RE-ENTERED — a standing order for the same patient, day and
 * clinician that no payslip carries — owes nothing: the session happened, its
 * PF was paid once on the voided order, and the re-entry sits in the same
 * already-closed cutoff, so it is never paid again (Hannah 2026-11-09: the five
 * "wrong" voids of 11/02 were corrected re-entries, not duplicates).
 */
export async function voidReentries(voided: { orderId: string; patientName: string | null; clinicianName: string | null; transactionDate: Date }[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>()
  const keyed = voided.filter(v => (v.patientName || '').trim() && (v.clinicianName || '').trim())
  if (!keyed.length) return out
  const dayOf = (d: Date) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  const dayStart = (d: Date) => new Date(`${dayOf(d)}T00:00:00+08:00`)
  const candidates = await prisma.order.findMany({
    where: {
      status: { not: 'VOIDED' },
      id: { notIn: keyed.map(v => v.orderId) },
      OR: keyed.map(v => ({
        patientName: { equals: v.patientName!.trim(), mode: 'insensitive' as const },
        transactionDate: { gte: dayStart(v.transactionDate), lt: new Date(dayStart(v.transactionDate).getTime() + 86_400_000) },
      })),
    },
    select: { id: true, orderNumber: true, patientName: true, clinicianName: true, transactionDate: true },
  })
  if (!candidates.length) return out
  const ids = candidates.map(c => c.id)
  const carried = new Set((await prisma.$queryRaw<{ order_id: string }[]>`
    SELECT DISTINCT s->>'orderId' AS order_id
    FROM "PayrollEntry" pe,
         jsonb_array_elements(pe.items::jsonb) it,
         jsonb_array_elements(COALESCE(it->'sessions', '[]'::jsonb)) s
    WHERE s->>'orderId' = ANY(${ids})`).map(r => r.order_id))
  const norm = (x: string | null) => (x || '').trim().toUpperCase()
  for (const v of keyed) {
    const nums = candidates
      .filter(c => !carried.has(c.id) && norm(c.patientName) === norm(v.patientName) && norm(c.clinicianName) === norm(v.clinicianName)
        && dayOf(c.transactionDate) === dayOf(v.transactionDate))
      .map(c => c.orderNumber).sort((a, b) => a - b)
    if (nums.length) out.set(v.orderId, nums)
  }
  return out
}

export async function hmoPfAlerts(includeSettled: boolean) {
  const settlements = await prisma.orderHmoSettlement.findMany({
    where: includeSettled ? {} : { pfResolvedAt: null },
    include: {
      order: {
        select: {
          id: true, orderNumber: true, transactionDate: true, patientName: true, netAmount: true, branch: true, clinicianName: true, status: true,
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
  if (!settlements.length) return []

  const latestByOrder = new Map<string, (typeof settlements)[number]>()
  for (const s of settlements) latestByOrder.set(s.orderId, s)
  const orderIds = [...latestByOrder.keys()]
  const isVoid = (s: (typeof settlements)[number]) => s.reference === HMO_VOID_REF && s.order.status === 'VOIDED'

  // Voids: the decreases made on the same order before it was voided. One
  // already deducted means the consultant now holds only the PF at the
  // decreased amount; one still open is folded into the void (it is no longer
  // the latest row, so it raises no alert of its own).
  const voidOrderIds = [...latestByOrder.values()].filter(isVoid).map(s => s.orderId)
  const priorDecreases = voidOrderIds.length
    ? await prisma.orderHmoSettlement.findMany({
        where: { orderId: { in: voidOrderIds }, pfResolvedAt: { not: null }, OR: [{ reference: null }, { reference: { not: HMO_VOID_REF } }] },
        select: { orderId: true },
      })
    : []
  const priorOf = new Map<string, { deducted: boolean }>(priorDecreases.map(p => [p.orderId, { deducted: true }]))

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
    voided: isVoid(s),
    settled: !!s.pfResolvedAt,
    deductedCutoff: parseResolution(s.pfResolvedNote).cutoff,
    resolvedAt: s.pfResolvedAt,
    resolvedBy: s.pfResolvedById ? resolverName.get(s.pfResolvedById) || null : null,
    resolvedNote: parseResolution(s.pfResolvedNote).note,
  })
  const alerts = []

  /* HUB — finalized/locked payroll lines */
  const hubRows = rows.filter(r => r.status !== 'DRAFT' && r.unit_pay_id)
  // Voided-and-re-entered sessions keep their PF (see voidReentries).
  const hubVoids = [...new Set(hubRows.map(r => r.order_id))].map(id => latestByOrder.get(id)).filter((s): s is (typeof settlements)[number] => !!s && isVoid(s))
  const reentered = hubVoids.length
    ? await voidReentries(hubVoids.map(s => ({ orderId: s.orderId, patientName: s.order.patientName, clinicianName: s.order.clinicianName, transactionDate: s.order.transactionDate })))
    : new Map<string, number[]>()
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
    if (isVoid(s) && reentered.has(s.orderId)) continue
    // Void: nothing is earned. If an earlier decrease was already deducted the
    // consultant holds the PF at the decreased amount (the order's net), else
    // the PF actually paid.
    const policy = isVoid(s) ? 0 : rateAt(rate, r.branch, Number(s.order.netAmount))
    const held = isVoid(s) && priorOf.get(s.orderId)?.deducted
      ? Math.min(Number(r.unit_amount), rateAt(rate, r.branch, Number(s.order.netAmount)))
      : Number(r.unit_amount)
    const overpaid = round2((held - policy) * Number(r.qty))
    if (overpaid <= 0.005) continue
    alerts.push({
      ...base(s), source: 'HUB' as const,
      consultantId: r.consultant_id, payrollBranch: r.branch,
      consultant: r.consultant, cutoffPeriod: r.cutoff, entryStatus: r.status, unitPayName: r.unit_pay_name,
      quantity: Number(r.qty), pfPaid: Number(r.unit_amount), pfPolicy: policy, overpaid,
    })
  }

  /* OUTSIDE_HUB — sessions no payroll entry carries */
  // Never for a void: payroll run outside the hub (Jan–Mar 2026) was not built
  // from hub orders, so voiding one (often an import duplicate) says nothing
  // about PF paid on it; and a later void no payslip carries was never paid.
  const outside = [...latestByOrder.values()].filter(s => !inHub.has(s.orderId) && s.order.clinicianName && !isVoid(s))
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
          consultantId: c.id, payrollBranch: branch,
          consultant: c.name, cutoffPeriod: null, entryStatus: null, unitPayName: rate.unitPay.name,
          quantity, pfPaid: paid, pfPolicy: policy, overpaid,
        })
      }
    }
  }

  alerts.sort((a, b) => a.consultant.localeCompare(b.consultant) || String(a.sessionDate).localeCompare(String(b.sessionDate)))
  return alerts
}
