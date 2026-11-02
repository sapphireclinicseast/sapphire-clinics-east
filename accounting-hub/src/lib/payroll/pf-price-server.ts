// Server side of the PF-above-price check (see pf-price.ts): which services each
// consultant's unit pays really pay for, rates set above those prices, and
// sessions where the PF came to more than what was charged.

import { prisma } from '@/lib/prisma'
import { notMigratedOrder } from './exclude-migrated'
import { ORDER_TO_PAYROLL_BRANCH, branchPriceMap, overPrice, rateAt, type OverPrice, type PfRate, type PricedService } from './pf-price'

export interface RateIssue extends OverPrice {
  consultantId: string
  consultant: string
  unitPayId: string
  unitPay: string
}

export interface SessionIssue {
  consultantId: string
  consultant: string
  orderId: string
  orderNumber: number
  date: string
  patientName: string | null
  service: string
  unitPayId: string
  unitPay: string
  quantity: number
  charged: number // what the session was charged, per unit
  pay: number // PF per unit — what the payroll line paid, or today's rate if not yet in a payroll
  // The hub payroll that carries the session (DRAFT, FINAL or LOCKED); null = not yet run.
  payroll: { cutoff: string; status: string } | null
  over: number // (pay − charged) × quantity
  // LINE = a priced line paid more than its own charge; ORDER = a ₱0 "BASIC
  // SESSION" carrier whose PF is more than the rest of the order was charged.
  kind: 'LINE' | 'ORDER'
}

const words = (s: string) => s.toUpperCase().split(/[^A-ZÑ]+/).filter(Boolean)

/** Surname of the doctor a service is named after ("PEDIATRICS - DR. DAVID ONG (CONSULT)" → ONG). */
function namedDoctor(serviceName: string): string | null {
  const m = /\bDR\.?\s+([^()]+)/i.exec(serviceName)
  const w = m ? words(m[1]) : []
  return w.length ? w[w.length - 1] : null
}

type ConsultantLite = {
  id: string; name: string; department: string; branch: string; extraBranches: string[]
  unitPayRates: { unitPayId: string; amount: unknown; disabled: boolean; thresholdEnabled: boolean; thresholdAmount: unknown; reducedAmount: unknown; branchAmounts: unknown; unitPay: { name: string } }[]
}

const CONSULTANT_SELECT = {
  id: true, name: true, department: true, branch: true, extraBranches: true,
  unitPayRates: {
    select: {
      unitPayId: true, amount: true, disabled: true, thresholdEnabled: true, thresholdAmount: true, reducedAmount: true, branchAmounts: true,
      unitPay: { select: { name: true } },
    },
  },
} as const

/** Distinct (clinician, service) pairs ever sold — clinician upper-cased as payroll matches it. */
async function soldPairs(): Promise<Map<string, Set<string>>> {
  const rows = await prisma.$queryRaw<{ clinician: string; service_id: string }[]>`
    SELECT DISTINCT upper(trim(o."clinicianName")) AS clinician, oi."serviceId" AS service_id
    FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
    WHERE o.status = 'COMPLETED' AND o."clinicianName" IS NOT NULL AND oi."serviceId" IS NOT NULL`
  const out = new Map<string, Set<string>>()
  for (const r of rows) {
    const set = out.get(r.clinician) || new Set<string>()
    set.add(r.service_id); out.set(r.clinician, set)
  }
  return out
}

/** Before a consultant's first sale under a unit pay: does this service fit them —
 *  sold at their branch, in their department, and, if named after a doctor, theirs? */
function fits(s: { name: string; department: string; branch: string }, c: Pick<ConsultantLite, 'name' | 'department' | 'branch' | 'extraBranches'>) {
  if (s.branch !== 'ALL' && ![c.branch, ...(c.extraBranches || [])].includes(ORDER_TO_PAYROLL_BRANCH[s.branch] || s.branch)) return false
  const doctor = namedDoctor(s.name)
  if (doctor) return words(c.name).includes(doctor)
  return s.department.toUpperCase() === (c.department || '').toUpperCase()
}

// Unit-pay services that carry a price (base or per-branch) — ₱0 lines are priced through the order.
const PRICED_SERVICE_WHERE = {
  isActive: true, unitPayEnabled: true, unitPayId: { not: null }, allowPfAbovePrice: false,
  OR: [{ price: { gt: 0 } }, { branchPrices: { some: { price: { gt: 0 } } } }],
}

/**
 * For each consultant, the services each unit pay pays them for: the services
 * of that unit pay they have actually sold; or, if none yet, the ones that fit
 * them (see fits). A shared unit pay like MD CONSULT covers every doctor's
 * consult, so checking a rate against all of them would flag other doctors' prices.
 */
export async function servicesFor(consultants: ConsultantLite[]): Promise<Map<string, Record<string, PricedService[]>>> {
  const [services, soldBy] = await Promise.all([
    prisma.service.findMany({
      where: PRICED_SERVICE_WHERE,
      select: { id: true, name: true, price: true, branch: true, department: true, unitPayId: true, branchPrices: { select: { branch: true, price: true } } },
    }),
    soldPairs(),
  ])
  const byUnitPay = new Map<string, typeof services>()
  for (const s of services) {
    const list = byUnitPay.get(s.unitPayId!) || []
    list.push(s); byUnitPay.set(s.unitPayId!, list)
  }
  const priced = (s: (typeof services)[number]): PricedService =>
    ({ id: s.id, name: s.name, price: Number(s.price), branch: s.branch, branchPrices: branchPriceMap(s.branchPrices) })

  const out = new Map<string, Record<string, PricedService[]>>()
  for (const c of consultants) {
    const mySold = soldBy.get(c.name.trim().toUpperCase()) || new Set<string>()
    const perUnitPay: Record<string, PricedService[]> = {}
    // Every unit pay with priced services — including ones this consultant has
    // no rate for yet, so the editor still warns as one is typed.
    for (const [upId, linked] of byUnitPay) {
      const soldHere = linked.filter(s => mySold.has(s.id))
      const pool = soldHere.length ? soldHere : linked.filter(s => fits(s, c))
      if (pool.length) perUnitPay[upId] = pool.map(priced)
    }
    out.set(c.id, perUnitPay)
  }
  return out
}

export interface ServiceRate {
  consultantId: string
  consultant: string
  branches: string[]
  amount: number
  branchAmounts: unknown
  thresholdEnabled: boolean
  thresholdAmount: number | null
  reducedAmount: number | null
}

/**
 * The consultants whose PF a service (as it is being edited) would pay — by the
 * same rule as servicesFor — with their rates, so the Services page can warn
 * when a price is set below one of them.
 */
export async function ratesForService(svc: { id?: string | null; unitPayId: string; name: string; department: string; branch: string }): Promise<ServiceRate[]> {
  const [consultants, linked, soldBy] = await Promise.all([
    prisma.consultant.findMany({
      where: { isActive: true, unitPayRates: { some: { unitPayId: svc.unitPayId, disabled: false } } },
      select: CONSULTANT_SELECT,
    }),
    prisma.service.findMany({ where: { ...PRICED_SERVICE_WHERE, unitPayId: svc.unitPayId }, select: { id: true } }),
    soldPairs(),
  ])
  const ids = new Set(linked.map(s => s.id))
  if (svc.id) ids.add(svc.id)
  const out: ServiceRate[] = []
  for (const c of consultants) {
    const mySold = soldBy.get(c.name.trim().toUpperCase()) || new Set<string>()
    const soldAny = [...ids].some(id => mySold.has(id))
    if (soldAny ? !(svc.id && mySold.has(svc.id)) : !fits(svc, c)) continue
    const r = c.unitPayRates.find(x => x.unitPayId === svc.unitPayId && !x.disabled)
    if (!r || !(Number(r.amount) > 0)) continue
    out.push({
      consultantId: c.id, consultant: c.name, branches: [c.branch, ...(c.extraBranches || [])].filter(Boolean),
      amount: Number(r.amount), branchAmounts: r.branchAmounts, thresholdEnabled: r.thresholdEnabled,
      thresholdAmount: r.thresholdAmount != null ? Number(r.thresholdAmount) : null,
      reducedAmount: r.reducedAmount != null ? Number(r.reducedAmount) : null,
    })
  }
  return out.sort((a, b) => a.consultant.localeCompare(b.consultant))
}

/** One consultant's services per unit pay — for the rate editor. */
export async function consultantServices(consultantId: string) {
  const c = await prisma.consultant.findUnique({ where: { id: consultantId }, select: CONSULTANT_SELECT })
  if (!c) return null
  return (await servicesFor([c])).get(c.id) || {}
}

/** Active consultants' enabled rates that pay more than a service they cover is priced at. */
export async function rateIssues(): Promise<RateIssue[]> {
  const consultants = await prisma.consultant.findMany({ where: { isActive: true }, select: CONSULTANT_SELECT })
  const services = await servicesFor(consultants)
  const out: RateIssue[] = []
  for (const c of consultants) {
    const branches = [c.branch, ...(c.extraBranches || [])].filter(Boolean)
    for (const r of c.unitPayRates) {
      if (r.disabled || !(Number(r.amount) > 0)) continue
      for (const o of overPrice(r, services.get(c.id)?.[r.unitPayId] || [], branches)) {
        out.push({ ...o, consultantId: c.id, consultant: c.name, unitPayId: r.unitPayId, unitPay: r.unitPay.name })
      }
    }
  }
  return out.sort((a, b) => a.consultant.localeCompare(b.consultant) || a.unitPay.localeCompare(b.unitPay))
}

/** First day of the hub's first consultant payroll cutoff (e.g. "2026-04-01") — earlier
 *  sessions were paid outside the hub, so their PF isn't known here. Null if none run yet. */
export async function hubPayrollStart(): Promise<string | null> {
  const [row] = await prisma.$queryRaw<{ first: string | null }[]>`
    SELECT min("cutoffPeriod") AS first FROM "PayrollEntry" WHERE "cutoffPeriod" ~ '^[0-9]{4}-[0-9]{2}-[12]$'`
  if (!row?.first) return null
  const [y, m, half] = row.first.split('-')
  return `${y}-${m}-${half === '1' ? '01' : '16'}`
}

/**
 * Completed sessions since `since` (never before the hub's first payroll) whose
 * PF came to more than they were charged. Sessions already in a hub payroll use
 * the PF that payroll line paid; the rest use the rules payroll/generate pays by
 * today: clinician matched by name, branch rate override, threshold on the order
 * net less separately paid lines, and no PF on HMO-paid medical sessions.
 */
export async function sessionIssues(since: Date, hubStart: string | null): Promise<SessionIssue[]> {
  if (hubStart) {
    const floor = new Date(`${hubStart}T00:00:00+08:00`)
    if (floor > since) since = floor
  }
  const [consultants, orders] = await Promise.all([
    prisma.consultant.findMany({ where: { isActive: true }, select: CONSULTANT_SELECT }),
    prisma.order.findMany({
      where: {
        status: 'COMPLETED', clinicianName: { not: null }, transactionDate: { gte: since },
        items: { some: { service: { unitPayId: { not: null } } } },
        AND: [notMigratedOrder],
      },
      select: {
        id: true, orderNumber: true, clinicianName: true, patientName: true, branch: true, transactionDate: true, netAmount: true,
        items: {
          select: {
            name: true, quantity: true, unitPrice: true, lineTotal: true,
            service: { select: { department: true, unitPayId: true, unitPayEnabled: true, hmoPaysClinicianDirect: true, allowPfAbovePrice: true } },
          },
        },
        payments: { select: { method: true } },
      },
      orderBy: { transactionDate: 'desc' },
    }),
  ])
  const byName = new Map(consultants.map(c => [c.name.trim().toUpperCase(), c]))
  const out: SessionIssue[] = []
  for (const o of orders) {
    const c = byName.get((o.clinicianName || '').trim().toUpperCase())
    if (!c) continue
    const rateOf = (unitPayId: string | null | undefined) => (unitPayId ? c.unitPayRates.find(r => r.unitPayId === unitPayId && !r.disabled) : undefined)
    const hmoPaid = o.payments.some(p => p.method === 'HMO')
    const branch = ORDER_TO_PAYROLL_BRANCH[o.branch] || o.branch
    const net = Number(o.netAmount) || 0
    let ownPaid = 0
    for (const i of o.items) {
      const r = i.service?.unitPayEnabled !== false ? rateOf(i.service?.unitPayId) : undefined
      if (r && !r.thresholdEnabled) ownPaid += Number(i.lineTotal) || 0
    }
    const basis = net - ownPaid
    const date = o.transactionDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

    // Lines whose service allows PF above its price are paid as usual but never flagged.
    const paid: { item: (typeof o.items)[number]; unitPayId: string; unitPay: string; pay: number }[] = []
    for (const i of o.items) {
      if (!i.service || i.service.unitPayEnabled === false) continue
      const r = rateOf(i.service.unitPayId)
      if (!r) continue
      if (hmoPaid && (String(i.service.department || '').toUpperCase() === 'MD' || i.service.hmoPaysClinicianDirect)) continue
      paid.push({ item: i, unitPayId: r.unitPayId, unitPay: r.unitPay.name, pay: rateAt(r, branch, basis) })
    }
    const base = { consultantId: c.id, consultant: c.name, orderId: o.id, orderNumber: o.orderNumber, date, patientName: o.patientName }

    // Priced lines: PF per unit vs what the line was charged per unit.
    for (const p of paid) {
      if (p.item.service?.allowPfAbovePrice) continue
      const qty = Number(p.item.quantity) || 1
      const line = Number(p.item.lineTotal) || 0
      if (!(Number(p.item.unitPrice) > 0 || line > 0)) continue
      const charged = line / qty
      if (p.pay > charged + 0.005) {
        out.push({ ...base, service: p.item.name, unitPayId: p.unitPayId, unitPay: p.unitPay, quantity: qty, charged, pay: p.pay, over: (p.pay - charged) * qty, kind: 'LINE', payroll: null })
      }
    }
    // ₱0 carrier lines are paid out of the rest of the order.
    const carriers = paid.filter(p => !(Number(p.item.unitPrice) > 0) && !(Number(p.item.lineTotal) > 0) && !p.item.service?.allowPfAbovePrice)
    if (carriers.length) {
      const rest = net - paid.reduce((s, p) => s + (Number(p.item.lineTotal) || 0), 0)
      const qty = carriers.reduce((s, p) => s + (Number(p.item.quantity) || 1), 0)
      const pf = carriers.reduce((s, p) => s + p.pay * (Number(p.item.quantity) || 1), 0)
      if (pf > rest + 0.005) {
        out.push({
          ...base, service: o.items.map(i => i.name).join(' + '), unitPayId: carriers[0].unitPayId, unitPay: carriers[0].unitPay, quantity: qty,
          charged: rest / qty, pay: pf / qty, over: pf - rest, kind: 'ORDER', payroll: null,
        })
      }
    }
  }
  if (!out.length) return out

  // Sessions already in a hub payroll: what that payroll line actually paid.
  const rows = await prisma.$queryRaw<{ cutoff: string; status: string; consultant_id: string; unit_pay_id: string | null; unit_amount: number; order_id: string }[]>`
    SELECT pe."cutoffPeriod" AS cutoff, pe.status, pe."consultantId" AS consultant_id, it->>'unitPayId' AS unit_pay_id,
           (it->>'unitAmount')::float AS unit_amount, s->>'orderId' AS order_id
    FROM "PayrollEntry" pe,
         jsonb_array_elements(pe.items::jsonb) it,
         jsonb_array_elements(COALESCE(it->'sessions', '[]'::jsonb)) s
    WHERE s->>'orderId' = ANY(${[...new Set(out.map(x => x.orderId))]})`
  const inPayroll = new Map<string, (typeof rows)[number]>()
  for (const r of rows) {
    const key = `${r.order_id}|${r.consultant_id}|${r.unit_pay_id}`
    const prev = inPayroll.get(key)
    if (!prev || prev.status === 'DRAFT') inPayroll.set(key, r) // a finalized line beats a draft
  }
  return out.flatMap(x => {
    const r = inPayroll.get(`${x.orderId}|${x.consultantId}|${x.unitPayId}`)
    if (!r) return [x]
    const pay = Number(r.unit_amount)
    const over = (pay - x.charged) * x.quantity
    return over > 0.005 ? [{ ...x, pay, over, payroll: { cutoff: r.cutoff, status: r.status } }] : []
  })
}

// ── Blocking saves: PF can never be set above the price it is paid on ──

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const BRANCH_NAME: Record<string, string> = { SBEA: 'East', SBGH: 'Greenhills' }
const overText = (o: OverPrice) => `PF ${peso(o.pay)} > ${o.service} ${peso(o.price)}${o.branch ? ` at ${BRANCH_NAME[o.branch] || o.branch}` : ''}`

/** The 400 message for a refused save. */
export const pfBlockMessage = (blocks: string[], fix: string) =>
  `PF can't be higher than the service price — ${fix}\n${blocks.map(b => `• ${b}`).join('\n')}`

/** Rates about to be saved that pay more than a service they cover is priced at, one line each. */
export async function rateBlocks(entries: { consultantId: string; rates: (PfRate & { unitPayId: string })[] }[]): Promise<string[]> {
  const consultants = await prisma.consultant.findMany({ where: { id: { in: entries.map(e => e.consultantId) } }, select: CONSULTANT_SELECT })
  if (!consultants.length) return []
  const [services, unitPays] = await Promise.all([
    servicesFor(consultants),
    prisma.unitPay.findMany({ select: { id: true, name: true } }),
  ])
  const upName = new Map(unitPays.map(u => [u.id, u.name]))
  const out: string[] = []
  for (const e of entries) {
    const c = consultants.find(x => x.id === e.consultantId)
    if (!c) continue
    for (const r of e.rates) {
      if (r.disabled || !(Number(r.amount) > 0)) continue
      const overrides = Object.keys((r.branchAmounts as Record<string, unknown> | null | undefined) || {})
      const branches = [...new Set([c.branch, ...(c.extraBranches || []), ...overrides])].filter(Boolean)
      const o = overPrice(r, services.get(c.id)?.[r.unitPayId] || [], branches)[0]
      if (o) out.push(`${entries.length > 1 ? `${c.name} — ` : ''}${upName.get(r.unitPayId) || 'Unit pay'}: ${overText(o)}`)
    }
  }
  return out
}

/** For a service about to be saved: each consultant it would pay more PF than it
 *  charges (now, or at its scheduled price). Empty when PF above price is allowed. */
export async function servicePriceBlocks(svc: {
  id?: string | null; unitPayId: string | null; unitPayEnabled: boolean; allowPfAbovePrice: boolean
  name: string; department: string; branch: string; price: number; newPrice: number | null
  branchPrices: { branch: string; price: unknown; newPrice?: unknown }[]
}): Promise<string[]> {
  if (!svc.unitPayId || !svc.unitPayEnabled || svc.allowPfAbovePrice) return []
  const rates = await ratesForService({ ...svc, unitPayId: svc.unitPayId })
  if (!rates.length) return []
  const bps = svc.branch === 'ALL' ? svc.branchPrices : []
  const now: PricedService = { id: svc.id || 'new', name: svc.name, price: svc.price, branch: svc.branch, branchPrices: branchPriceMap(bps) }
  const scheduled: PricedService | null = svc.newPrice || bps.some(b => b.newPrice)
    ? { ...now, price: svc.newPrice || svc.price, branchPrices: branchPriceMap(bps.map(b => ({ branch: b.branch, price: b.newPrice || b.price }))) }
    : null
  const out = new Set<string>()
  for (const r of rates) {
    for (const [s, label] of [[now, ''], [scheduled, ' (scheduled price)']] as const) {
      const o = s ? overPrice(r, [s], r.branches)[0] : undefined
      if (o) out.add(`${r.consultant}: PF ${peso(o.pay)} > price ${peso(o.price)}${o.branch ? ` at ${BRANCH_NAME[o.branch] || o.branch}` : ''}${label}`)
    }
  }
  return [...out]
}
