import type { PrismaClient } from '@prisma/client'

/**
 * Referral commission engine — the single source of truth used by the
 * Commission report AND payroll, so both always agree:
 *
 * - DOCTOR commission: ₱rate per session (earned, non-voided POS order) of the
 *   doctor's referred patients. A session is attributed by the order's own
 *   Doctor Referral tag, or by the patient's Referred-patients link when the
 *   order wasn't tagged (CRM id first, else exact name — the Referral
 *   Dashboard's rule). The explicit tag wins on conflict.
 * - MEDREP incentive: one-time ₱amount per NEW patient brought by an EXTERNAL
 *   referrer (outside doctor, law firm, partner school), triggered by the
 *   patient's FIRST session ever.
 *
 * Both honor COMMISSION_START (sessions/first-visits before it never earn) and
 * the ReferralCommissionItem claim ledger: payroll pays only unclaimed units
 * and stamps them, so nothing double-counts across cutoffs — and a session
 * tagged late simply gets swept into the next cutoff instead of being lost.
 */

// The scheme's start (owner's call, 2026-10-07): nothing earns before this.
export const COMMISSION_START = '2026-10-01'
export const commissionFloor = () => new Date(`${COMMISSION_START}T00:00:00+08:00`)

// Referrer names carry DR./DRA. honorifics inconsistently (and one HR record
// has "DR." inside firstName) — match with them stripped.
export const stripDr = (s: string) => s.toUpperCase().replace(/^(?:\s*DRA?\.?\s+)+/, '')
export const normName = (s: string) => stripDr(s).replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()

export const patientKeyOf = (patientId: string | null | undefined, patientName: string | null | undefined) =>
  patientId || (patientName || '').trim().toLowerCase()

export interface AttributedSession {
  orderId: string
  orderNumber: number
  date: Date
  branch: string
  patientName: string | null
  patientKey: string
  net: number
  paymentStatus: string | null
  via: 'tag' | 'link'
}

export interface DoctorCommissionRow {
  referrerId: string
  name: string
  specialization: string | null
  isInhouse: boolean
  rate: number | null
  sessions: AttributedSession[]
}

/**
 * Sessions per doctor in [from, to] (both clamped to COMMISSION_START by the
 * caller or here — `from` is clamped defensively). With `onlyUnclaimed`,
 * sessions already stamped by a payroll claim are excluded.
 */
export async function computeDoctorCommissions(prisma: PrismaClient, opts: {
  from: Date
  to: Date
  branch?: string
  scopeBranch?: string | null // role-based referrer visibility (SANDBOX_*)
  onlyUnclaimed?: boolean
}): Promise<DoctorCommissionRow[]> {
  const floor = commissionFloor()
  const from = opts.from < floor ? floor : opts.from

  const doctors = await prisma.referrer.findMany({
    where: {
      isActive: true, type: 'DOCTOR',
      ...(opts.scopeBranch ? { OR: [{ branches: { isEmpty: true } }, { branches: { has: opts.scopeBranch } }] } : {}),
    },
    select: { id: true, name: true, specialization: true, isInhouse: true, commissionPerSession: true },
  })
  const doctorIds = new Set(doctors.map(d => d.id))

  const referred = await prisma.referredPatient.findMany({
    where: { referrerId: { in: [...doctorIds] } },
    select: { referrerId: true, patientId: true, patientName: true },
  })
  const byId = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const r of referred) {
    if (r.patientId && !byId.has(r.patientId)) byId.set(r.patientId, r.referrerId)
    const k = r.patientName.trim().toLowerCase()
    if (!byName.has(k)) byName.set(k, r.referrerId)
  }

  const ids = [...byId.keys()]
  const names = Array.from(new Set(referred.map(r => r.patientName)))
  const orders = await prisma.order.findMany({
    where: {
      transactionDate: { gte: from, lte: opts.to },
      status: { notIn: ['VOIDED'] },
      revenueType: { not: 'UNEARNED' },
      ...(opts.branch ? { branch: opts.branch } : {}),
      OR: [
        { referrerId: { not: null } },
        ...(ids.length ? [{ patientId: { in: ids } }] : []),
        ...(names.length ? [{ patientName: { in: names } }] : []),
      ],
    },
    orderBy: { transactionDate: 'asc' },
    select: {
      id: true, orderNumber: true, transactionDate: true, branch: true,
      patientId: true, patientName: true, netAmount: true, paymentStatus: true, referrerId: true,
    },
  })

  let claimed = new Set<string>()
  if (opts.onlyUnclaimed && orders.length) {
    const rows = await prisma.referralCommissionItem.findMany({
      where: { kind: 'DOCTOR', orderId: { in: orders.map(o => o.id) } },
      select: { orderId: true },
    })
    claimed = new Set(rows.map(r => r.orderId as string))
  }

  const perDoctor = new Map<string, AttributedSession[]>()
  for (const o of orders) {
    if (claimed.has(o.id)) continue
    const tagged = o.referrerId && doctorIds.has(o.referrerId) ? o.referrerId : null
    const linked = (o.patientId && byId.get(o.patientId)) || byName.get((o.patientName || '').trim().toLowerCase()) || null
    const rid = tagged || linked
    if (!rid || !doctorIds.has(rid)) continue
    const list = perDoctor.get(rid) || []
    list.push({
      orderId: o.id, orderNumber: o.orderNumber, date: o.transactionDate, branch: o.branch,
      patientName: o.patientName, patientKey: patientKeyOf(o.patientId, o.patientName),
      net: Number(o.netAmount), paymentStatus: o.paymentStatus, via: tagged ? 'tag' : 'link',
    })
    perDoctor.set(rid, list)
  }

  return doctors.map(d => ({
    referrerId: d.id,
    name: d.name,
    specialization: d.specialization,
    isInhouse: d.isInhouse,
    rate: d.commissionPerSession == null ? null : Number(d.commissionPerSession),
    sessions: perDoctor.get(d.id) || [],
  }))
}

export interface MedrepNewPatient {
  patientKey: string
  patientName: string
  referrerId: string
  referrerName: string
  referrerType: string | null
  firstDate: Date
  branch: string
  orderNumber: number
}

/**
 * New referred patients whose FIRST session ever falls in [from, to] (and on
 * or after COMMISSION_START — a patient who first came before the scheme is
 * not "new"). Only patients linked to EXTERNAL referrers count: outside
 * doctors (not in-house), law firms, partner schools. With `onlyUnclaimed`,
 * patients already stamped by a MEDREP claim are excluded.
 */
export async function computeMedrepNewPatients(prisma: PrismaClient, opts: {
  from: Date
  to: Date
  branch?: string
  onlyUnclaimed?: boolean
}): Promise<MedrepNewPatient[]> {
  const floor = commissionFloor()
  const from = opts.from < floor ? floor : opts.from

  const externals = await prisma.referrer.findMany({
    where: { isActive: true, OR: [{ type: { in: ['LAW_FIRM', 'PARTNER_SCHOOL'] } }, { type: 'DOCTOR', isInhouse: false }] },
    select: { id: true, name: true, type: true },
  })
  const extById = new Map(externals.map(r => [r.id, r]))

  const referred = await prisma.referredPatient.findMany({
    where: { referrerId: { in: [...extById.keys()] } },
    orderBy: { createdAt: 'asc' },
    select: { referrerId: true, patientId: true, patientName: true },
  })
  if (!referred.length) return []

  // Patient → referrer, first link wins; keep both CRM-id and name keys.
  const linkByKey = new Map<string, { referrerId: string; patientName: string }>()
  for (const r of referred) {
    for (const k of [r.patientId, r.patientName.trim().toLowerCase()]) {
      if (k && !linkByKey.has(k)) linkByKey.set(k, { referrerId: r.referrerId, patientName: r.patientName })
    }
  }

  // First session EVER per patient (no date floor here — an old patient who
  // returns after the scheme started is not a new patient).
  const ids = Array.from(new Set(referred.map(r => r.patientId).filter(Boolean))) as string[]
  const names = Array.from(new Set(referred.map(r => r.patientName)))
  const orders = await prisma.order.findMany({
    where: {
      status: { notIn: ['VOIDED'] },
      revenueType: { not: 'UNEARNED' },
      OR: [...(ids.length ? [{ patientId: { in: ids } }] : []), ...(names.length ? [{ patientName: { in: names } }] : [])],
    },
    orderBy: { transactionDate: 'asc' },
    select: { orderNumber: true, transactionDate: true, branch: true, patientId: true, patientName: true },
  })

  const first = new Map<string, { date: Date; branch: string; orderNumber: number; patientName: string }>()
  for (const o of orders) {
    const link = (o.patientId && linkByKey.get(o.patientId)) || linkByKey.get((o.patientName || '').trim().toLowerCase())
    if (!link) continue
    const k = patientKeyOf(o.patientId && linkByKey.has(o.patientId) ? o.patientId : null, link.patientName)
    if (!first.has(k)) first.set(k, { date: o.transactionDate, branch: o.branch, orderNumber: o.orderNumber, patientName: link.patientName })
  }

  let out: MedrepNewPatient[] = []
  for (const [k, f] of first) {
    if (f.date < from || f.date > opts.to) continue
    if (opts.branch && f.branch !== opts.branch) continue
    const link = linkByKey.get(k) || linkByKey.get(f.patientName.trim().toLowerCase())
    if (!link) continue
    const ref = extById.get(link.referrerId)
    if (!ref) continue
    out.push({
      patientKey: k, patientName: f.patientName, referrerId: ref.id, referrerName: ref.name,
      referrerType: ref.type, firstDate: f.date, branch: f.branch, orderNumber: f.orderNumber,
    })
  }

  if (opts.onlyUnclaimed && out.length) {
    const rows = await prisma.referralCommissionItem.findMany({
      where: { kind: 'MEDREP', patientKey: { in: out.map(p => p.patientKey) } },
      select: { patientKey: true },
    })
    const claimed = new Set(rows.map(r => r.patientKey as string))
    out = out.filter(p => !claimed.has(p.patientKey))
  }

  return out.sort((a, b) => a.firstDate.getTime() - b.firstDate.getTime())
}
