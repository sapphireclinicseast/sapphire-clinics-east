// Server side of AR → Tuition: Class Hub data over the ops app's internal API
// (shared EXTERNAL_API_KEY, same as the POS queue bridge) and the plan items'
// paid status from the POS orders that collected them.
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  CLASS_TO_LEDGER_BRANCH, REMIND_DAYS, allocatePlanPayments, asTuitionPlan, cleanCovered, coveredLabel, daysBetween, installmentLedger, itemState,
  regularDues, semesterBalances, toYmd, todayManila, type Installment, type ItemState, type PlanPayment, type SemesterBalance, type TuitionPlan,
} from '@/lib/tuition'

const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''
const auth = () => ({ authorization: `Bearer ${EXTERNAL_API_KEY}` })

export interface ClassHubStudent { id: string; name: string; email: string; level: string | null; branch: string | null; patientId: string | null }
export interface ClassHubPayment {
  classPortalPaymentId: string; studentId: string; plan: string; period: string; amountCentavos: number
  status: 'PENDING' | 'CONVERTED' | 'VOIDED'; method: string | null; methodDetail: string | null
  isPartialPayment: boolean; notes: string | null; createdAt: string; convertedAt: string | null
}
export interface ClassHubNote { id: string; studentId: string; fileName: string; fileType: string; fileSize: number; notes: string | null; uploadedBy: string | null; createdAt: string }
export interface ClassHubSnapshot { schoolYear: number; students: ClassHubStudent[]; payments: ClassHubPayment[]; notes: ClassHubNote[] }

export async function fetchClassHub(params: { classBranch?: string | null; schoolYear?: number }): Promise<ClassHubSnapshot> {
  const qs = new URLSearchParams()
  if (params.classBranch) qs.set('branch', params.classBranch)
  if (params.schoolYear) qs.set('sy', String(params.schoolYear))
  const res = await fetch(`${MARKETING_HUB_URL}/api/internal/class-portal/tuition?${qs}`, { headers: auth(), cache: 'no-store' })
  if (!res.ok) throw new Error(`Class Hub returned ${res.status}`)
  return res.json()
}

export async function fetchClassHubNote(id: string): Promise<Response> {
  return fetch(`${MARKETING_HUB_URL}/api/internal/class-portal/promissory-notes/${encodeURIComponent(id)}`, { headers: auth(), cache: 'no-store' })
}

/** POS sales that collected Class Hub payment rows, keyed by classPortalPaymentId. */
export async function posSalesFor(paymentIds: string[]): Promise<Map<string, { orderId: string; orderNumber: number; date: string; amount: number; enteredAt: string }>> {
  const out = new Map<string, { orderId: string; orderNumber: number; date: string; amount: number; enteredAt: string }>()
  if (!paymentIds.length) return out
  const orders = await prisma.order.findMany({
    where: { queueItemId: { in: paymentIds.map(id => `clsp_${id}`) }, status: { not: 'VOIDED' } },
    select: { id: true, orderNumber: true, transactionDate: true, queueItemId: true, netAmount: true, createdAt: true },
  })
  for (const o of orders) {
    out.set((o.queueItemId || '').slice('clsp_'.length), { orderId: o.id, orderNumber: o.orderNumber, date: toYmd(o.transactionDate), amount: Number(o.netAmount), enteredAt: o.createdAt.toISOString() })
  }
  return out
}

export interface PlanItemView {
  id: string; seq: number; dueDate: string; amount: number; classPortalPaymentId: string | null
  /** Collected so far; the item is settled (paidOn) once this reaches amount. */
  paid: number
  paidOn: string | null; orderNumber: number | null; inPos: boolean; state: ItemState; daysUntil: number
}
export interface PlanView {
  id: string; studentId: string; studentName: string; patientId: string | null; branch: string; promissoryNoteId: string | null
  schoolYear: number; semester: number; originalDueDate: string; amount: number; notes: string | null; status: string
  /** Due dates of every installment the note covers. */
  coveredDueDates: string[]
  items: PlanItemView[]; paid: number; balance: number; createdAt: string
}

type PlanRow = Awaited<ReturnType<typeof loadPlans>>[number]
export function loadPlans(where: Prisma.TuitionPaymentPlanWhereInput) {
  return prisma.tuitionPaymentPlan.findMany({ where, include: { items: { orderBy: { seq: 'asc' } } }, orderBy: { createdAt: 'asc' } })
}

/**
 * Plan rows → views with what each item has collected (allocatePlanPayments).
 * Pass the Class Hub snapshot wherever one is at hand: without it only the sales
 * linked to the items are known, not a covered month collected some other way.
 */
export async function planViews(plans: PlanRow[], hub?: ClassHubSnapshot): Promise<PlanView[]> {
  const linked = plans.flatMap(p => p.items.map(i => i.classPortalPaymentId).filter((x): x is string => !!x))
  const studentIds = new Set(plans.map(p => p.studentId))
  const hubRows = (hub?.payments ?? []).filter(r => studentIds.has(r.studentId))
  const sales = await posSalesFor([...new Set([...linked, ...hubRows.map(r => r.classPortalPaymentId)])])
  const today = todayManila()
  return plans.map(p => {
    const rows = hubRows.filter(r => r.studentId === p.studentId && r.status !== 'VOIDED')
    const payments: PlanPayment[] = hub
      ? rows.filter(r => r.status === 'CONVERTED' || sales.has(r.classPortalPaymentId)).map(r => {
          const sale = sales.get(r.classPortalPaymentId)
          return {
            id: r.classPortalPaymentId, period: r.period, amount: r.amountCentavos / 100,
            enteredAt: sale?.enteredAt ?? r.convertedAt ?? r.createdAt,
            date: sale?.date ?? toYmd(r.convertedAt ?? r.createdAt), orderNumber: sale?.orderNumber ?? null,
          }
        })
      : p.items.flatMap(i => {
          const sale = i.classPortalPaymentId ? sales.get(i.classPortalPaymentId) : undefined
          return sale ? [{ id: i.classPortalPaymentId as string, period: '', amount: sale.amount, enteredAt: sale.enteredAt, date: sale.date, orderNumber: sale.orderNumber }] : []
        })
    const covered = cleanCovered(p.coveredDueDates)
    const coveredDueDates = covered.length ? covered : [toYmd(p.originalDueDate)]
    const collected = allocatePlanPayments({
      plan: asTuitionPlan(rows[rows.length - 1]?.plan) || 'MONTHLY', coveredDueDates, createdAt: p.createdAt.toISOString(),
      items: p.items.map(i => ({ id: i.id, dueDate: toYmd(i.dueDate), amount: Number(i.amount), classPortalPaymentId: i.classPortalPaymentId })),
      payments,
    })
    const items: PlanItemView[] = p.items.map(i => {
      const dueDate = toYmd(i.dueDate)
      const c = collected.get(i.id)
      return {
        id: i.id, seq: i.seq, dueDate, amount: Number(i.amount), classPortalPaymentId: i.classPortalPaymentId,
        paid: c?.paid ?? 0, paidOn: c?.paidOn ?? null, orderNumber: c?.orderNumber ?? null,
        inPos: !!i.classPortalPaymentId && !payments.some(x => x.id === i.classPortalPaymentId),
        state: itemState(dueDate, c?.paidOn ?? null, today), daysUntil: daysBetween(today, dueDate),
      }
    })
    const paid = Math.round(items.reduce((t, i) => t + i.paid, 0) * 100) / 100
    return {
      id: p.id, studentId: p.studentId, studentName: p.studentName, patientId: p.patientId, branch: p.branch,
      promissoryNoteId: p.promissoryNoteId, schoolYear: p.schoolYear, semester: p.semester,
      originalDueDate: toYmd(p.originalDueDate), amount: Number(p.amount), notes: p.notes, status: p.status,
      coveredDueDates,
      items, paid, balance: Math.round((Number(p.amount) - paid) * 100) / 100, createdAt: p.createdAt.toISOString(),
    }
  })
}

/** Why some of these installments can't go on this plan — another active plan already covers them — or null. */
export async function coveredElsewhere(studentId: string, covered: string[], exceptPlanId: string | null): Promise<string | null> {
  const others = await loadPlans({ studentId, status: 'ACTIVE', ...(exceptPlanId ? { id: { not: exceptPlanId } } : {}) })
  const taken = new Set(others.flatMap(p => {
    const c = cleanCovered(p.coveredDueDates)
    return c.length ? c : [toYmd(p.originalDueDate)]
  }))
  const both = covered.filter(d => taken.has(d))
  return both.length ? `Another payment plan already covers ${both.join(', ')}. Edit that plan instead.` : null
}

export interface TuitionReminder {
  itemId: string; planId: string; studentId: string; studentName: string; patientId: string | null; branch: string
  seq: number; count: number; dueDate: string; amount: number; daysUntil: number; inPos: boolean
}

/** Unpaid plan payments due within REMIND_DAYS, or overdue, on active plans. */
export async function dueReminders(branches: string[] | null): Promise<TuitionReminder[]> {
  const plans = await loadPlans({ status: 'ACTIVE', ...(branches ? { branch: { in: branches } } : {}) })
  let views = await planViews(plans)
  // Class Hub is only asked when something is due; if it can't be reached the
  // reminder still goes out, just without any payment made outside the plan.
  if (views.some(p => p.items.some(i => !i.paidOn && i.daysUntil <= REMIND_DAYS))) {
    const hub = await fetchClassHub({}).catch(err => { console.error('[tuition] reminders: Class Hub fetch failed', err); return null })
    if (hub) views = await planViews(plans, hub)
  }
  const out: TuitionReminder[] = []
  for (const p of views) {
    for (const i of p.items) {
      if (i.paidOn || i.daysUntil > REMIND_DAYS) continue
      out.push({
        itemId: i.id, planId: p.id, studentId: p.studentId, studentName: p.studentName, patientId: p.patientId,
        branch: p.branch, seq: i.seq, count: p.items.length, dueDate: i.dueDate, amount: Math.round((i.amount - i.paid) * 100) / 100,
        daysUntil: i.daysUntil, inPos: i.inPos,
      })
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil)
}


// Who may see AR → Tuition, set plans, and send a payment to the POS queue.
// Front desk collect at the till, so they may send to the queue but not plan.
export const TUITION_WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN']
export const TUITION_COLLECT_ROLES = [...TUITION_WRITE_ROLES, 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
export const TUITION_READ_ROLES = [...TUITION_COLLECT_ROLES, 'VIEWER']
// Settling part of an installment by discount forgoes money, so it is kept to
// the people who own the books.
export const TUITION_DISCOUNT_ROLES = ['ADMIN', 'ACCOUNTANT']
export const TUITION_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS']

// ── POS tuition picker: what each student owes ──────────────────────────────

export interface TuitionDue {
  key: string
  kind: 'REGULAR' | 'PROMISSORY'
  plan: TuitionPlan
  period: string          // the Class Hub label the payment is recorded under
  dueDate: string
  expected: number        // the full installment, or the scheduled promissory amount
  paid: number            // already recorded toward it
  remaining: number
  state: 'OVERDUE' | 'DUE_SOON' | 'UPCOMING'
  daysUntil: number
  planItemId?: string
  seq?: number
  count?: number
}
export interface StudentBalance {
  id: string; name: string; email: string; level: string | null; branch: string; patientId: string | null
  plan: TuitionPlan | null; rate: number | null; discountLabel: string | null
  /** Enrolled in Class Hub with no payment yet this school year — a new student. */
  isNew: boolean
  paidThisSy: number
  /** By semester (lib/tuition semesterBalances): tuition net of discounts, paid, balance.
   *  runningBalance = tuition of the semesters started so far − paid (negative = paid ahead). */
  semesters: SemesterBalance[] | null; yearTuition: number | null; runningBalance: number | null
  dues: TuitionDue[]; nextDue: TuitionDue | null
  /** Every installment from the first payment, with what settles it — what a promissory plan picks its months from. */
  installments: Installment[]
  payments: { period: string; amount: number; date: string; orderNumber: number | null; partial: boolean }[]
  /** Installments settled by discount instead of cash (TuitionAdjustment) — counted
   *  in dues and the running balance, never in paidThisSy. */
  adjustments: TuitionAdjustmentView[]
  discountedThisSy: number
}
export interface TuitionAdjustmentView { id: string; period: string; amount: number; reason: string; by: string | null; date: string }

/** Discounts recorded against the students' installments for one school year. */
export async function tuitionAdjustments(studentIds: string[], schoolYear: number): Promise<Map<string, TuitionAdjustmentView[]>> {
  const out = new Map<string, TuitionAdjustmentView[]>()
  if (!studentIds.length) return out
  // Never let this take the tuition screens down (e.g. table not yet created).
  const rows = await prisma.tuitionAdjustment.findMany({
    where: { studentId: { in: studentIds }, schoolYear }, orderBy: { createdAt: 'asc' },
  }).catch(err => { console.error('[tuition] adjustments lookup failed:', err); return [] })
  for (const r of rows) {
    const list = out.get(r.studentId) || []
    list.push({ id: r.id, period: r.period, amount: Number(r.amount), reason: r.reason, by: r.createdByName, date: toYmd(r.createdAt) })
    out.set(r.studentId, list)
  }
  return out
}

/**
 * Per student for one school year: the regular installments due within
 * REMIND_DAYS or overdue (Class Hub's plan rules), less what is recorded for
 * each; and the unpaid payments of any active promissory plan, which replace
 * the installment they delay. A student's dues start at their first recorded
 * payment, so a mid-year enrolee owes nothing for the months before it, and an
 * overpayment of one installment carries to the next.
 */
export async function studentBalances(params: { classBranch: string | null; schoolYear?: number; hub?: ClassHubSnapshot }): Promise<{ schoolYear: number; students: StudentBalance[] }> {
  const hub = params.hub ?? await fetchClassHub({ classBranch: params.classBranch, schoolYear: params.schoolYear })
  const [plans, sales, adjustmentsOf] = await Promise.all([
    loadPlans({ studentId: { in: hub.students.map(s => s.id) }, status: 'ACTIVE' }).then(rows => planViews(rows, hub)),
    posSalesFor(hub.payments.map(p => p.classPortalPaymentId)),
    tuitionAdjustments(hub.students.map(s => s.id), hub.schoolYear),
  ])
  const orderIds = [...new Set([...sales.values()].map(s => s.orderId))]
  const labels = new Map((orderIds.length
    ? await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, discountLabel: true, discountAmount: true } })
    : []).map(o => [o.id, Number(o.discountAmount) > 0 ? o.discountLabel : null]))
  const today = todayManila()

  const students = hub.students.map(s => {
    const rows = hub.payments.filter(p => p.studentId === s.id && p.status !== 'VOIDED')
    const paidRows = rows.filter(p => p.status === 'CONVERTED' || sales.has(p.classPortalPaymentId))
    const plan = asTuitionPlan(rows[rows.length - 1]?.plan)
    // The installment is the amount this plan is most often paid in (the
    // latest wins a tie) — a lone smaller payment is usually an unflagged
    // partial, not a new rate.
    const ofPlan = paidRows.filter(p => asTuitionPlan(p.plan) === plan)
    const full = ofPlan.filter(p => !p.isPartialPayment)
    const counts = new Map<number, number>()
    for (const p of full) counts.set(p.amountCentavos, (counts.get(p.amountCentavos) || 0) + 1)
    const rateCentavos = [...full].reverse().map(p => p.amountCentavos)
      .reduce<number | null>((best, c) => (best === null || (counts.get(c) || 0) > (counts.get(best) || 0) ? c : best), null)
      ?? ofPlan[ofPlan.length - 1]?.amountCentavos ?? null
    const rate = rateCentavos ? rateCentavos / 100 : null
    const lastSale = [...paidRows].reverse().map(p => sales.get(p.classPortalPaymentId)).find(Boolean)
    const dues: TuitionDue[] = []
    let nextDue: TuitionDue | null = null
    const myPlans = plans.filter(p => p.studentId === s.id)
    const adjustments = adjustmentsOf.get(s.id) || []
    // What settles each installment: the cash recorded, plus any discount.
    const settled = [
      ...paidRows.map(r => ({ period: r.period, amount: r.amountCentavos / 100 })),
      ...adjustments.map(a => ({ period: a.period, amount: a.amount })),
    ]

    if (plan && rate) {
      const owed = regularDues({
        plan, rate, schoolYear: hub.schoolYear, today,
        payments: settled,
        promissoryDueDates: new Set(myPlans.flatMap(pl => pl.coveredDueDates)),
      })
      for (const o of owed) {
        const due: TuitionDue = {
          key: `reg:${o.period}`, kind: 'REGULAR', plan, period: o.period, dueDate: o.dueDate,
          expected: o.expected, paid: o.paid, remaining: o.remaining,
          state: o.daysUntil < 0 ? 'OVERDUE' : o.daysUntil <= REMIND_DAYS ? 'DUE_SOON' : 'UPCOMING', daysUntil: o.daysUntil,
        }
        if (o.daysUntil <= REMIND_DAYS) dues.push(due)
        else if (!nextDue) nextDue = due
      }
    }
    const ledger = plan && rate ? installmentLedger({ plan, rate, schoolYear: hub.schoolYear, payments: settled }) : []
    for (const pl of myPlans) {
      const pPlan = plan || 'MONTHLY'
      // A covered month already settled drops off the label the cashier collects under.
      const open = pl.coveredDueDates.filter(d => (ledger.find(x => x.dueDate === d)?.remaining ?? 1) >= 0.01)
      for (const it of pl.items) {
        if (it.paidOn) continue
        dues.push({
          key: `pn:${it.id}`, kind: 'PROMISSORY', plan: pPlan, period: coveredLabel(pPlan, open.length ? open : pl.coveredDueDates),
          dueDate: it.dueDate, expected: it.amount, paid: it.paid, remaining: Math.round((it.amount - it.paid) * 100) / 100,
          state: it.state === 'OVERDUE' ? 'OVERDUE' : it.state === 'DUE_SOON' ? 'DUE_SOON' : 'UPCOMING',
          daysUntil: it.daysUntil, planItemId: it.id, seq: it.seq, count: pl.items.length,
        })
      }
    }
    dues.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    const paidThisSy = Math.round(paidRows.reduce((t, r) => t + r.amountCentavos, 0)) / 100
    const bySem = plan && rate
      ? semesterBalances({ plan, rate, schoolYear: hub.schoolYear, today, payments: settled })
      : null
    return {
      id: s.id, name: s.name, email: s.email, level: s.level,
      branch: CLASS_TO_LEDGER_BRANCH[s.branch || ''] || s.branch || '', patientId: s.patientId,
      plan, rate, discountLabel: lastSale ? labels.get(lastSale.orderId) ?? null : null,
      isNew: rows.length === 0,
      paidThisSy,
      semesters: bySem?.semesters ?? null, yearTuition: bySem?.yearTuition ?? null, runningBalance: bySem?.runningBalance ?? null,
      dues, nextDue,
      installments: ledger,
      payments: paidRows.map(r => ({
        period: r.period, amount: r.amountCentavos / 100, date: sales.get(r.classPortalPaymentId)?.date || (r.convertedAt ? toYmd(r.convertedAt) : toYmd(r.createdAt)),
        orderNumber: sales.get(r.classPortalPaymentId)?.orderNumber ?? null, partial: r.isPartialPayment,
      })),
      adjustments,
      discountedThisSy: Math.round(adjustments.reduce((t, a) => t + a.amount, 0) * 100) / 100,
    }
  })
  return { schoolYear: hub.schoolYear, students }
}

/** POS payment method → how Class Hub labels it. */
export function classHubMethod(method: string | null | undefined): { method: string; methodDetail: string | null } {
  switch (method) {
    case 'PAYMONGO': return { method: 'PAYMONGO', methodDetail: null }
    case 'GCASH': return { method: 'FRONT_DESK_CASH', methodDetail: 'GCASH' }
    case 'PAYMAYA': return { method: 'FRONT_DESK_CASH', methodDetail: 'PAYMAYA' }
    case 'CREDIT_CARD': return { method: 'FRONT_DESK_CASH', methodDetail: 'CREDIT_CARD' }
    case 'DEBIT': return { method: 'FRONT_DESK_CASH', methodDetail: 'DEBIT_CARD' }
    case 'BANK_TRANSFER': case 'BANK_DEPOSIT': case 'CHECK': return { method: 'BANK_DEPOSIT', methodDetail: null }
    default: return { method: 'FRONT_DESK_CASH', methodDetail: 'CASH' }
  }
}

/**
 * Record a tuition sale in Class Hub: the payment row is created already PAID
 * (CONVERTED) — the POS is the only place tuition is recorded. Fire-and-forget
 * callers log the error; the sale itself is the source of truth.
 */
export async function recordClassHubPayment(args: {
  classPortalPaymentId: string; studentId: string; plan: string; period: string; amountCentavos: number
  isPartialPayment: boolean; method: string; methodDetail: string | null; notes: string; paidAt: string
}) {
  const res = await fetch(`${MARKETING_HUB_URL}/api/internal/class-portal/frontdesk-payments`, {
    method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ ...args, status: 'CONVERTED' }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error || `Class Hub returned ${res.status}`)
  return body.payment as { classPortalPaymentId: string; status: string }
}
