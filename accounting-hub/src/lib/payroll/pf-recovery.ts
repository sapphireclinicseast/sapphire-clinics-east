// Automatic PF recovery on the payslip being prepared. PF overpaid on an earlier
// payslip — after an HMO decrease (Payroll → HMO PF Adjustments) or above what
// the session was charged (Payroll → PF Above Price) — becomes a deduction line
// (id `pr-hmo` / `pr-price`) on the same consultant's payslip for the same branch
// in the next cutoff generated. Saving that payslip records each session as
// deducted in its cutoff; removing the line and saving releases them again.

import { prisma } from '@/lib/prisma'
import { hmoPfAlerts } from './hmo-pf-alerts'
import { hubPayrollStart, sessionIssues } from './pf-price-server'

// Marker on a recovery saved by a payslip (PfOverPriceRecovery.note, or the note
// part of OrderHmoSettlement.pfResolvedNote): `auto:<payrollEntryId>`.
const AUTO = 'auto:'
export const isAutoRecovery = (note: string | null | undefined) => !!note && note.startsWith(AUTO)

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
    remarks: `Auto PF recovery: ${list.slice(0, 6).join(', ')}${list.length > 6 ? ` +${list.length - 6} more` : ''}`,
    prSessions: sessions,
  }
}

/**
 * The PF recovery lines for each consultant's payslip in `cutoffPeriod` at
 * `branch` (all branches if empty): overpayments paid in an EARLIER cutoff at
 * that branch that nothing has recorded as deducted yet, plus the ones a saved
 * payslip of this cutoff already took (so a saved draft previews the same line).
 */
export async function recoveryLines(cutoffPeriod: string, branch: string): Promise<Map<string, PrLine[]>> {
  const hubStart = await hubPayrollStart()
  const [hmo, price] = await Promise.all([
    hmoPfAlerts(true),
    sessionIssues(new Date('2026-01-01T00:00:00+08:00'), hubStart, { paidOnly: true }),
  ])
  const takenHere = (cutoff: string | null, note: string | null) => cutoff === cutoffPeriod && isAutoRecovery(note)
  const byConsultant = new Map<string, { hmo: PrSession[]; price: PrSession[] }>()
  const bucket = (id: string) => {
    const b = byConsultant.get(id) || { hmo: [], price: [] }
    byConsultant.set(id, b)
    return b
  }

  for (const a of hmo) {
    if (branch && a.payrollBranch !== branch) continue
    const due = !a.settled && (a.source === 'OUTSIDE_HUB' || (a.cutoffPeriod != null && a.cutoffPeriod < cutoffPeriod))
    if (!due && !(a.settled && takenHere(a.deductedCutoff, a.resolvedNote))) continue
    bucket(a.consultantId).hmo.push({
      kind: 'HMO', ref: a.settlementId, orderId: a.orderId, orderNumber: a.orderNumber,
      date: new Date(a.sessionDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), amount: round2(a.overpaid),
    })
  }
  for (const s of price) {
    if (!s.payroll || s.payroll.status === 'DRAFT') continue
    if (branch && s.payroll.branch !== branch) continue
    const due = !s.recovered && s.payroll.cutoff < cutoffPeriod
    if (!due && !(s.recovered && takenHere(s.recovered.cutoff, s.recovered.note))) continue
    bucket(s.consultantId).price.push({
      kind: 'PRICE', ref: s.unitPayId, orderId: s.orderId, orderNumber: s.orderNumber, date: s.date, amount: round2(s.over),
    })
  }

  const out = new Map<string, PrLine[]>()
  for (const [consultantId, b] of byConsultant) {
    const lines: PrLine[] = []
    if (b.hmo.length) lines.push(line('pr-hmo', 'PF overpaid — HMO decreases', b.hmo))
    if (b.price.length) lines.push(line('pr-price', 'PF above what was charged', b.price))
    if (lines.length) out.set(consultantId, lines)
  }
  return out
}

/**
 * On saving a payslip: record the sessions its `pr-` lines deduct as deducted in
 * `cutoffPeriod`, after releasing whatever this payslip recorded before — so a
 * line removed from the payslip frees its sessions for the next cutoff.
 */
export async function stampRecoveries(args: {
  entryId: string; consultantId: string; cutoffPeriod: string; adjustments: unknown[]; userId: string | null
}) {
  const { entryId, consultantId, cutoffPeriod, adjustments, userId } = args
  const marker = `${AUTO}${entryId}`
  await prisma.pfOverPriceRecovery.deleteMany({ where: { note: marker } })
  await prisma.orderHmoSettlement.updateMany({
    where: { pfResolvedNote: { endsWith: ` — ${marker}` } },
    data: { pfResolvedAt: null, pfResolvedById: null, pfResolvedNote: null },
  })
  const sessions = (adjustments as { id?: string; prSessions?: PrSession[] }[])
    .filter(l => String(l?.id || '').startsWith('pr-'))
    .flatMap(l => (Array.isArray(l.prSessions) ? l.prSessions : []))
  for (const s of sessions) {
    if (s.kind === 'PRICE') {
      const data = { cutoffPeriod, amount: s.amount, note: marker, recordedById: userId, recordedAt: new Date() }
      await prisma.pfOverPriceRecovery.upsert({
        where: { orderId_consultantId_unitPayId: { orderId: s.orderId, consultantId, unitPayId: s.ref } },
        update: data, create: { orderId: s.orderId, consultantId, unitPayId: s.ref, ...data },
      })
    } else {
      // Never overwrite a deduction someone recorded by hand.
      await prisma.orderHmoSettlement.updateMany({
        where: { id: s.ref, pfResolvedAt: null },
        data: { pfResolvedAt: new Date(), pfResolvedById: userId, pfResolvedNote: `cutoff:${cutoffPeriod} — ${marker}` },
      })
    }
  }
}
