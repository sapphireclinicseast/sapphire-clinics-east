// Server side of AR → Tuition: Class Hub data over the ops app's internal API
// (shared EXTERNAL_API_KEY, same as the POS queue bridge) and the plan items'
// paid status from the POS orders that collected them.
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { REMIND_DAYS, daysBetween, itemState, toYmd, todayManila, type ItemState } from '@/lib/tuition'

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

/** Open the Class Hub payment row that puts a plan item in the POS queue. */
export async function openClassHubPayment(args: { classPortalPaymentId: string; studentId: string; amountCentavos: number; period: string; notes?: string }) {
  const res = await fetch(`${MARKETING_HUB_URL}/api/internal/class-portal/frontdesk-payments`, {
    method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify(args),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error || `Class Hub returned ${res.status}`)
  return body.payment as { classPortalPaymentId: string; status: string }
}

/** POS sales that collected Class Hub payment rows, keyed by classPortalPaymentId. */
export async function posSalesFor(paymentIds: string[]): Promise<Map<string, { orderId: string; orderNumber: number; date: string }>> {
  const out = new Map<string, { orderId: string; orderNumber: number; date: string }>()
  if (!paymentIds.length) return out
  const orders = await prisma.order.findMany({
    where: { queueItemId: { in: paymentIds.map(id => `clsp_${id}`) }, status: { not: 'VOIDED' } },
    select: { id: true, orderNumber: true, transactionDate: true, queueItemId: true },
  })
  for (const o of orders) {
    out.set((o.queueItemId || '').slice('clsp_'.length), { orderId: o.id, orderNumber: o.orderNumber, date: toYmd(o.transactionDate) })
  }
  return out
}

export interface PlanItemView {
  id: string; seq: number; dueDate: string; amount: number; classPortalPaymentId: string | null
  paidOn: string | null; orderNumber: number | null; inPos: boolean; state: ItemState; daysUntil: number
}
export interface PlanView {
  id: string; studentId: string; studentName: string; patientId: string | null; branch: string; promissoryNoteId: string | null
  schoolYear: number; semester: number; originalDueDate: string; amount: number; notes: string | null; status: string
  items: PlanItemView[]; paid: number; balance: number; createdAt: string
}

type PlanRow = Awaited<ReturnType<typeof loadPlans>>[number]
export function loadPlans(where: Prisma.TuitionPaymentPlanWhereInput) {
  return prisma.tuitionPaymentPlan.findMany({ where, include: { items: { orderBy: { seq: 'asc' } } }, orderBy: { createdAt: 'asc' } })
}

/**
 * Plan rows → views with each item's paid state. An item is paid once the POS
 * sale for its Class Hub row exists; `confirmedAt` covers a row confirmed in
 * Class Hub before the POS became the one door.
 */
export async function planViews(plans: PlanRow[], confirmedAt?: Map<string, string>): Promise<PlanView[]> {
  const ids = plans.flatMap(p => p.items.map(i => i.classPortalPaymentId).filter((x): x is string => !!x))
  const sales = await posSalesFor(ids)
  const today = todayManila()
  return plans.map(p => {
    const items: PlanItemView[] = p.items.map(i => {
      const dueDate = toYmd(i.dueDate)
      const sale = i.classPortalPaymentId ? sales.get(i.classPortalPaymentId) : undefined
      const paidOn = sale?.date ?? (i.classPortalPaymentId ? confirmedAt?.get(i.classPortalPaymentId) ?? null : null)
      return {
        id: i.id, seq: i.seq, dueDate, amount: Number(i.amount), classPortalPaymentId: i.classPortalPaymentId,
        paidOn, orderNumber: sale?.orderNumber ?? null, inPos: !!i.classPortalPaymentId && !paidOn,
        state: itemState(dueDate, paidOn, today), daysUntil: daysBetween(today, dueDate),
      }
    })
    const paid = items.filter(i => i.paidOn).reduce((s, i) => s + i.amount, 0)
    return {
      id: p.id, studentId: p.studentId, studentName: p.studentName, patientId: p.patientId, branch: p.branch,
      promissoryNoteId: p.promissoryNoteId, schoolYear: p.schoolYear, semester: p.semester,
      originalDueDate: toYmd(p.originalDueDate), amount: Number(p.amount), notes: p.notes, status: p.status,
      items, paid, balance: Math.round((Number(p.amount) - paid) * 100) / 100, createdAt: p.createdAt.toISOString(),
    }
  })
}

export interface TuitionReminder {
  itemId: string; planId: string; studentId: string; studentName: string; patientId: string | null; branch: string
  seq: number; count: number; dueDate: string; amount: number; daysUntil: number; inPos: boolean
}

/** Unpaid plan payments due within REMIND_DAYS, or overdue, on active plans. */
export async function dueReminders(branches: string[] | null): Promise<TuitionReminder[]> {
  const plans = await loadPlans({ status: 'ACTIVE', ...(branches ? { branch: { in: branches } } : {}) })
  const views = await planViews(plans)
  const out: TuitionReminder[] = []
  for (const p of views) {
    for (const i of p.items) {
      if (i.paidOn || i.daysUntil > REMIND_DAYS) continue
      out.push({
        itemId: i.id, planId: p.id, studentId: p.studentId, studentName: p.studentName, patientId: p.patientId,
        branch: p.branch, seq: i.seq, count: p.items.length, dueDate: i.dueDate, amount: i.amount,
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
export const TUITION_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS']
