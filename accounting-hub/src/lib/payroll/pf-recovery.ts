// PF recovery on a payslip. PF overpaid on an earlier payslip — after an HMO
// decrease (Payroll → HMO PF Adjustments) or above what the session was charged
// (Payroll → PF Above Price) — comes off a payslip ONLY once the payroll officer
// picks the cutoff to deduct it in and presses Record (Hannah 11/10: nothing is
// deducted before a cutoff is set). That cutoff's payslip for the same consultant
// at the branch that paid the PF then carries a `pr-hmo` / `pr-price` line; Undo
// on the tab takes it off again. A recording marked "by hand" (the payslip for
// that cutoff was already final or locked, so it was deducted some other way) is
// never added to a payslip.

import { prisma } from '@/lib/prisma'
import { hmoPfAlerts } from './hmo-pf-alerts'
import { hubPayrollStart, sessionIssues } from './pf-price-server'

// Note on a recording that was deducted outside the hub payslip (PfOverPriceRecovery.note,
// or the note part of OrderHmoSettlement.pfResolvedNote).
export const BY_HAND = 'by hand'
export const isByHand = (note: string | null | undefined) => !!note && note.toLowerCase().startsWith(BY_HAND)

export interface PrSession {
  kind: 'HMO' | 'PRICE'
  ref: string // OrderHmoSettlement id (HMO) or unitPayId (PRICE)
  orderId: string
  orderNumber: number
  date: string
  amount: number
}
export interface PrLine {
  id: string; name: string; amount: number; isAddition: false; isTaxed: true; remarks: string
  prSessions: PrSession[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDate = (ymd: string) => { const [, m, d] = ymd.split('-'); return `${MONTHS[parseInt(m, 10) - 1] ?? m} ${parseInt(d, 10)}` }

function line(id: string, label: string, sessions: PrSession[]): PrLine {
  const amount = round2(sessions.reduce((t, s) => t + s.amount, 0))
  const list = sessions.map(s => `#${s.orderNumber} ${shortDate(s.date)} ₱${s.amount.toLocaleString('en-PH')}`)
  return {
    id, name: `${label} (${sessions.length} session${sessions.length === 1 ? '' : 's'})`, amount,
    isAddition: false, isTaxed: true,
    remarks: `PF recovery: ${list.slice(0, 6).join(', ')}${list.length > 6 ? ` +${list.length - 6} more` : ''}`,
    prSessions: sessions,
  }
}

/**
 * The PF recovery lines for each consultant's payslip in `cutoffPeriod` at
 * `branch` (all branches if empty): the overpaid sessions recorded to be deducted
 * in this cutoff, at the branch that paid the PF. Open (unrecorded) ones are not
 * deducted anywhere.
 */
export async function recoveryLines(cutoffPeriod: string, branch: string): Promise<Map<string, PrLine[]>> {
  const hubStart = await hubPayrollStart()
  const [hmo, price] = await Promise.all([
    hmoPfAlerts(true),
    sessionIssues(new Date('2026-01-01T00:00:00+08:00'), hubStart, { paidOnly: true }),
  ])
  const deductHere = (cutoff: string | null | undefined, note: string | null | undefined) => cutoff === cutoffPeriod && !isByHand(note)
  const byConsultant = new Map<string, { hmo: PrSession[]; price: PrSession[] }>()
  const bucket = (id: string) => {
    const b = byConsultant.get(id) || { hmo: [], price: [] }
    byConsultant.set(id, b)
    return b
  }

  for (const a of hmo) {
    if (branch && a.payrollBranch !== branch) continue
    if (!a.settled || !deductHere(a.deductedCutoff, a.resolvedNote)) continue
    bucket(a.consultantId).hmo.push({
      kind: 'HMO', ref: a.settlementId, orderId: a.orderId, orderNumber: a.orderNumber,
      date: new Date(a.sessionDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), amount: round2(a.overpaid),
    })
  }
  for (const s of price) {
    if (!s.payroll || s.payroll.status === 'DRAFT') continue
    if (branch && s.payroll.branch !== branch) continue
    if (!s.recovered || !deductHere(s.recovered.cutoff, s.recovered.note)) continue
    bucket(s.consultantId).price.push({
      kind: 'PRICE', ref: s.unitPayId, orderId: s.orderId, orderNumber: s.orderNumber, date: s.date, amount: round2(s.over),
    })
  }

  const out = new Map<string, PrLine[]>()
  for (const [consultantId, b] of byConsultant) {
    const lines: PrLine[] = []
    if (b.hmo.length) lines.push(line('pr-hmo', 'PF overpaid — HMO decreases & voids', b.hmo))
    if (b.price.length) lines.push(line('pr-price', 'PF above what was charged', b.price))
    if (lines.length) out.set(consultantId, lines)
  }
  return out
}

/**
 * Whether the payslip a recording for `cutoff` would land on is already FINAL or
 * LOCKED (that status), else null. Nothing can be added to such a payslip, so the
 * Record buttons ask whether it was deducted there by hand instead.
 */
export async function closedPayslipStatus(targets: { consultantId: string; branch?: string | null }[], cutoff: string): Promise<string | null> {
  if (!targets.length) return null
  const row = await prisma.payrollEntry.findFirst({
    where: {
      cutoffPeriod: cutoff, status: { in: ['FINAL', 'LOCKED'] },
      OR: targets.map(t => ({ consultantId: t.consultantId, ...(t.branch ? { branch: t.branch } : {}) })),
    },
    select: { status: true },
  })
  return row?.status ?? null
}

export const closedPayslipMessage = (status: string) =>
  `That cutoff's payslip is already ${status === 'LOCKED' ? 'locked' : 'final'}, so the PF can't be deducted on it. Pick a later cutoff, or record it as deducted there by hand.`
