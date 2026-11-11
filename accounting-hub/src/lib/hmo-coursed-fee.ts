// Doctor's fee "coursed through the clinic" (Hannah 2026-11-11).
//
// Most HMOs pay the doctor directly for MD consults (services flagged
// hmoPaysClinicianDirect), so those consults are not our sale or AR and payroll
// gives no unit pay for them. Now and then an HMO pays SCEI instead, for one PV.
// For those consults only (a Payments to Doctors record with
// coursedThroughClinic):
//   · the consult is our sale and receivable (Order.hmoCoursedThroughClinic),
//     tagged when the HMO's payment is recorded;
//   · the doctor is paid by an EXPENSE RFP, charged to 8190 Professional Fees
//     (Consultants), for what the HMO paid us (the record's net amount).
// Payroll still skips HMO-paid medical sessions, so the doctor is never paid twice.

import type { Prisma, PrismaClient } from '@prisma/client'
import { orderGlNetCents, postOrderJournal, reverseOrderJournal } from '@/lib/accounting/post-order'

export const COURSED_FEE_ACCOUNT = '8190 Professional Fees (Consultants)'
export const COURSED_FEE_SOURCE = 'HMO_COURSED_DOCTOR_FEE'
export const RFP_BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH' }

/**
 * One-time expense entry (8190) wrapped in an EXPENSE RFP payable to the
 * doctor — the same shape as the referral-commission payout RFPs, on the
 * branch's shared running numbers. Call inside a transaction.
 */
export async function createCoursedFeeRfp(tx: Prisma.TransactionClient, a: {
  branch: string
  doctor: string
  amount: number
  description: string
  meta: Record<string, unknown>
  userId: string | null
}): Promise<{ id: string; refNumber: string }> {
  const code = RFP_BRANCH_CODE[a.branch]
  if (!code) throw new Error(`RFP branch must be East or Greenhills (got ${a.branch})`)
  const yy = new Date().getFullYear() % 100
  let settings = await tx.pettyCashSettings.findUnique({ where: { branch: a.branch } })
  if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch: a.branch, nextPcvSeq: 1 } })
  const maxAgg = await tx.pettyCashEntry.aggregate({ where: { branch: a.branch }, _max: { pcvSeq: true } })
  const pcvSeq = (maxAgg._max.pcvSeq || 0) + 1
  const entry = await tx.pettyCashEntry.create({
    data: {
      branch: a.branch,
      recordType: 'ONE_TIME',
      pcvNumber: `${code}-PCV${yy}-${String(pcvSeq).padStart(6, '0')}`,
      pcvSeq,
      pcvSub: 1,
      date: new Date(),
      requestor: a.doctor,
      description: a.description,
      accountTitle: COURSED_FEE_ACCOUNT,
      vatable: 'Non-VAT',
      validity: 'Valid',
      audited: true,
      grossAmount: a.amount,
      createdById: a.userId,
    },
  })
  const seq = Math.max(settings.nextReimbSeq, 1)
  await tx.pettyCashSettings.update({
    where: { branch: a.branch },
    data: { nextPcvSeq: Math.max(settings.nextPcvSeq, pcvSeq + 1), nextReimbSeq: seq + 1 },
  })
  const refNumber = `${code}-RFP${yy}-${String(seq).padStart(6, '0')}-VAL`
  const rfp = await tx.reimbursementReport.create({
    data: {
      branch: a.branch, refNumber, refSeq: seq, grossTotal: a.amount, kind: 'VALID', module: 'EXPENSE',
      payableTo: a.doctor,
      meta: { source: COURSED_FEE_SOURCE, account: COURSED_FEE_ACCOUNT, ...a.meta } as Prisma.InputJsonValue,
      createdById: a.userId,
    },
  })
  await tx.pettyCashEntry.update({ where: { id: entry.id }, data: { reimbursementId: rfp.id } })
  return { id: rfp.id, refNumber }
}

/**
 * Put coursed consults on the books as our sale (Dr AR / Cr revenue on the
 * session date). The order flag must already be set. Older consults carry an
 * MD_PASSTHROUGH_REMOVAL entry (the 2026-08-24 clean-up) that took the sale out
 * again — it is removed so the original sale stands; consults never posted are
 * posted now.
 */
export async function makeConsultsOurSales(prisma: PrismaClient, orderIds: string[], userId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const id of orderIds) {
    try {
      const removals = await prisma.journalEntry.findMany({ where: { referenceId: id, referenceType: 'MD_PASSTHROUGH_REMOVAL' }, select: { id: true } })
      if (removals.length) {
        await prisma.journalEntryLine.deleteMany({ where: { journalEntryId: { in: removals.map(r => r.id) } } })
        await prisma.journalEntry.deleteMany({ where: { id: { in: removals.map(r => r.id) } } })
      }
      if (await orderGlNetCents(prisma, id) > 0) {
        out[id] = removals.length ? 'SALE RESTORED (pass-through removal deleted)' : 'ALREADY A SALE'
        continue
      }
      const post = await postOrderJournal(prisma, id, userId)
      out[id] = post.posted ? 'POSTED' : `NOT POSTED (${post.reason || 'already posted'})`
    } catch (e) {
      console.error('[coursed fee] posting failed for order', id, e)
      out[id] = 'FAILED — check the server log'
    }
  }
  return out
}

/** Undo makeConsultsOurSales: clear the flag and reverse the standing sale. */
export async function undoConsultSales(prisma: PrismaClient, orderIds: string[], userId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!orderIds.length) return out
  await prisma.order.updateMany({ where: { id: { in: orderIds } }, data: { hmoCoursedThroughClinic: false } })
  for (const id of orderIds) {
    try {
      const rev = await reverseOrderJournal(prisma, id, userId, 'Doctor fee no longer coursed through the clinic — the HMO pays the doctor directly')
      out[id] = rev.posted ? 'SALE REVERSED' : `UNCHANGED (${rev.reason || 'not standing'})`
    } catch (e) {
      console.error('[coursed fee] reversal failed for order', id, e)
      out[id] = 'FAILED — check the server log'
    }
  }
  return out
}
