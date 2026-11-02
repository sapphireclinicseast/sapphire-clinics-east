// Server side of the PF-above-price check (see pf-price.ts): which services each
// consultant's unit pays really pay for, rates set above those prices, and
// sessions where the PF came to more than what was charged.

import { prisma } from '@/lib/prisma'
import { notMigratedOrder } from './exclude-migrated'
import { ORDER_TO_PAYROLL_BRANCH, overPrice, rateAt, type OverPrice, type PricedService } from './pf-price'

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
  unitPay: string
  quantity: number
  charged: number // what the session was charged, per unit
  pay: number // PF per unit
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

/**
 * For each consultant, the services each unit pay pays them for: the services
 * of that unit pay they have actually sold; or, if none yet, the ones that fit
 * them — sold at their branch, in their department, and, for a service named
 * after a doctor ("… - DR. DAVID ONG (CONSULT)"), only that doctor's.
 * A shared unit pay like MD CONSULT covers every doctor's consult, so checking
 * a rate against all of them would flag other doctors' prices.
 */
export async function servicesFor(consultants: ConsultantLite[]): Promise<Map<string, Record<string, PricedService[]>>> {
  const [services, sold] = await Promise.all([
    prisma.service.findMany({
      where: { isActive: true, unitPayEnabled: true, unitPayId: { not: null }, price: { gt: 0 } },
      select: { id: true, name: true, price: true, branch: true, department: true, unitPayId: true },
    }),
    prisma.$queryRaw<{ clinician: string; service_id: string }[]>`
      SELECT DISTINCT upper(trim(o."clinicianName")) AS clinician, oi."serviceId" AS service_id
      FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
      WHERE o.status = 'COMPLETED' AND o."clinicianName" IS NOT NULL AND oi."serviceId" IS NOT NULL`,
  ])
  const byUnitPay = new Map<string, typeof services>()
  for (const s of services) {
    const list = byUnitPay.get(s.unitPayId!) || []
    list.push(s); byUnitPay.set(s.unitPayId!, list)
  }
  const soldBy = new Map<string, Set<string>>()
  for (const r of sold) {
    const set = soldBy.get(r.clinician) || new Set<string>()
    set.add(r.service_id); soldBy.set(r.clinician, set)
  }

  const out = new Map<string, Record<string, PricedService[]>>()
  for (const c of consultants) {
    const mySold = soldBy.get(c.name.trim().toUpperCase()) || new Set<string>()
    const myBranches = new Set([c.branch, ...(c.extraBranches || [])])
    const myWords = new Set(words(c.name))
    const fits = (s: (typeof services)[number]) => {
      if (s.branch !== 'ALL' && !myBranches.has(ORDER_TO_PAYROLL_BRANCH[s.branch] || s.branch)) return false
      const doctor = namedDoctor(s.name)
      if (doctor) return myWords.has(doctor)
      return s.department.toUpperCase() === (c.department || '').toUpperCase()
    }
    const perUnitPay: Record<string, PricedService[]> = {}
    for (const r of c.unitPayRates) {
      const linked = byUnitPay.get(r.unitPayId) || []
      const soldHere = linked.filter(s => mySold.has(s.id))
      perUnitPay[r.unitPayId] = (soldHere.length ? soldHere : linked.filter(fits))
        .map(s => ({ id: s.id, name: s.name, price: Number(s.price), branch: s.branch }))
    }
    // Unit pays this consultant has no rate for yet — the editor still warns as one is typed.
    for (const [upId, linked] of byUnitPay) {
      if (perUnitPay[upId]) continue
      const soldHere = linked.filter(s => mySold.has(s.id))
      const pool = soldHere.length ? soldHere : linked.filter(fits)
      if (pool.length) perUnitPay[upId] = pool.map(s => ({ id: s.id, name: s.name, price: Number(s.price), branch: s.branch }))
    }
    out.set(c.id, perUnitPay)
  }
  return out
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

/**
 * Completed sessions since `since` whose PF came to more than they were
 * charged, with the same rules payroll/generate pays by: clinician matched by
 * name, branch rate override, threshold on the order net less separately paid
 * lines, and no PF on HMO-paid medical sessions.
 */
export async function sessionIssues(since: Date): Promise<SessionIssue[]> {
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
            service: { select: { department: true, unitPayId: true, unitPayEnabled: true, hmoPaysClinicianDirect: true } },
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

    const paid: { item: (typeof o.items)[number]; unitPay: string; pay: number }[] = []
    for (const i of o.items) {
      if (!i.service || i.service.unitPayEnabled === false) continue
      const r = rateOf(i.service.unitPayId)
      if (!r) continue
      if (hmoPaid && (String(i.service.department || '').toUpperCase() === 'MD' || i.service.hmoPaysClinicianDirect)) continue
      paid.push({ item: i, unitPay: r.unitPay.name, pay: rateAt(r, branch, basis) })
    }
    const base = { consultantId: c.id, consultant: c.name, orderId: o.id, orderNumber: o.orderNumber, date, patientName: o.patientName }

    // Priced lines: PF per unit vs what the line was charged per unit.
    for (const p of paid) {
      const qty = Number(p.item.quantity) || 1
      const line = Number(p.item.lineTotal) || 0
      if (!(Number(p.item.unitPrice) > 0 || line > 0)) continue
      const charged = line / qty
      if (p.pay > charged + 0.005) {
        out.push({ ...base, service: p.item.name, unitPay: p.unitPay, quantity: qty, charged, pay: p.pay, over: (p.pay - charged) * qty, kind: 'LINE' })
      }
    }
    // ₱0 carrier lines are paid out of the rest of the order.
    const carriers = paid.filter(p => !(Number(p.item.unitPrice) > 0) && !(Number(p.item.lineTotal) > 0))
    if (carriers.length) {
      const rest = net - paid.reduce((s, p) => s + (Number(p.item.lineTotal) || 0), 0)
      const qty = carriers.reduce((s, p) => s + (Number(p.item.quantity) || 1), 0)
      const pf = carriers.reduce((s, p) => s + p.pay * (Number(p.item.quantity) || 1), 0)
      if (pf > rest + 0.005) {
        out.push({
          ...base, service: o.items.map(i => i.name).join(' + '), unitPay: carriers[0].unitPay, quantity: qty,
          charged: rest / qty, pay: pf / qty, over: pf - rest, kind: 'ORDER',
        })
      }
    }
  }
  return out
}
