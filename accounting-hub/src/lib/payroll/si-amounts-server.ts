/**
 * Service Invoice amounts (server only): record what an invoice says, compare
 * it with finalized payroll less any differences carried into its cutoffs, and
 * keep a ConsultantSiAdjustment for a difference — carried to the cutoff the
 * user picks, or just flagged. Shared by si-submissions (POST/PATCH/DELETE)
 * and the reminder, so the screen, the API and the email agree.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  amountCheck, carriedInto, CUTOFF_RX, cutoffsOfKey, expectedInvoice,
  type SiAdjustment, type SiAdjustmentStatus,
} from '@/lib/payroll/si-coverage'

type Tx = Prisma.TransactionClient

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toAdjustment(r: any): SiAdjustment {
  return {
    id: r.id,
    consultantId: r.consultantId,
    sourceKeys: r.sourceKeys || [],
    sourceSiUrl: r.sourceSiUrl ?? null,
    sourceSiNumber: r.sourceSiNumber ?? null,
    invoiceAmount: Number(r.invoiceAmount),
    expectedAmount: Number(r.expectedAmount),
    amount: Number(r.amount),
    targetCutoff: r.targetCutoff ?? null,
    status: r.status as SiAdjustmentStatus,
    appliedKeys: r.appliedKeys || [],
    note: r.note ?? null,
    createdAt: new Date(r.createdAt).toISOString(),
  }
}

/** Finalized gross pay for the cutoffs, summed across branches (same as si-tracking). */
export async function payrollGrossFor(db: Tx | typeof prisma, consultantId: string, cutoffs: string[]): Promise<number> {
  if (!cutoffs.length) return 0
  const agg = await db.payrollEntry.aggregate({
    where: { consultantId, cutoffPeriod: { in: cutoffs }, status: { in: ['LOCKED', 'FINAL'] } },
    _sum: { grossPay: true },
  })
  return Math.round(Number(agg._sum?.grossPay || 0) * 100) / 100
}

/**
 * Remove what an invoice covering `keys` did to the adjustments: differences
 * it raised are deleted, differences it absorbed go back to waiting.
 * Run before an invoice is replaced, re-amounted or removed.
 */
export async function undoInvoiceEffects(tx: Tx, consultantId: string, keys: string[]) {
  if (!keys.length) return
  await tx.consultantSiAdjustment.deleteMany({ where: { consultantId, sourceKeys: { hasSome: keys } } })
  await tx.consultantSiAdjustment.updateMany({
    where: { consultantId, status: 'APPLIED', appliedKeys: { hasSome: keys } },
    data: { status: 'OPEN', appliedKeys: [], appliedSiUrl: null, appliedAt: null },
  })
}

export interface AmountInput {
  siNumber?: string | null
  invoiceAmount: number
  /** Where a difference goes: a cutoff ("YYYY-MM-1/2"), or null to flag it without carrying. */
  carry?: { targetCutoff: string | null; note?: string | null }
  /** Carried differences NOT to absorb on this invoice (they keep waiting). */
  skipAdjustmentIds?: string[]
}

export class AmountError extends Error {
  constructor(message: string, public status = 400, public detail?: Record<string, unknown>) { super(message) }
}

/**
 * Check an invoice's amount and record the outcome on its rows (which must
 * already exist). Returns the comparison so the caller can echo it.
 */
export async function applyInvoiceAmount(tx: Tx, args: {
  consultantId: string; keys: string[]; siUrl: string | null; userId: string; input: AmountInput
}) {
  const { consultantId, keys, siUrl, userId, input } = args
  const cutoffs = keys.flatMap(cutoffsOfKey).sort()
  const invoice = Math.round(Number(input.invoiceAmount) * 100) / 100
  if (!Number.isFinite(invoice) || invoice < 0) throw new AmountError('Enter the amount on the invoice')

  const payroll = await payrollGrossFor(tx, consultantId, cutoffs)
  const open = (await tx.consultantSiAdjustment.findMany({ where: { consultantId, status: 'OPEN' } })).map(toAdjustment)
  const skip = new Set(input.skipAdjustmentIds || [])
  const carried = carriedInto(cutoffs, open).filter(a => !skip.has(a.id))
  const expected = expectedInvoice(payroll, carried)
  // No finalized payroll for any of these cutoffs (e.g. before the hub ran
  // payroll) and nothing carried in: nothing to compare, so no flag.
  const noFigures = payroll === 0 && carried.length === 0
  const check = noFigures ? { diff: 0, result: 'nopay' as const } : amountCheck(invoice, expected)

  let target: string | null = null
  if (check.result === 'over' || check.result === 'under') {
    if (!input.carry) {
      throw new AmountError(
        `The invoice is ₱${Math.abs(check.diff).toFixed(2)} ${check.diff > 0 ? 'more' : 'less'} than expected — choose where the difference goes`,
        400, { expected, payroll, diff: check.diff },
      )
    }
    target = input.carry.targetCutoff
    if (target !== null && (!CUTOFF_RX.test(target) || cutoffs.includes(target))) {
      throw new AmountError('Pick a cutoff outside this invoice to carry the difference to')
    }
  }

  const siNumber = (input.siNumber || '').trim() || null
  await tx.consultantSiSubmission.updateMany({
    where: { consultantId, month: { in: keys } },
    data: { siNumber, invoiceAmount: invoice, expectedAmount: noFigures ? null : expected },
  })
  if (carried.length) {
    await tx.consultantSiAdjustment.updateMany({
      where: { id: { in: carried.map(a => a.id) } },
      data: { status: 'APPLIED', appliedKeys: keys, appliedSiUrl: siUrl, appliedAt: new Date() },
    })
  }
  if (check.result === 'over' || check.result === 'under') {
    await tx.consultantSiAdjustment.create({
      data: {
        consultantId, sourceKeys: keys, sourceSiUrl: siUrl, sourceSiNumber: siNumber,
        invoiceAmount: invoice, expectedAmount: expected, amount: check.diff,
        targetCutoff: target, status: target ? 'OPEN' : 'FLAGGED',
        note: (input.carry?.note || '').trim() || null, createdById: userId,
      },
    })
  }
  return { payroll, expected, invoice, diff: check.diff, result: check.result, carriedIds: carried.map(a => a.id), targetCutoff: target }
}

/** Parse the optional amount part of a request body; undefined when no amount was sent. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readAmountInput(b: any): AmountInput | undefined {
  if (b?.invoiceAmount === undefined || b?.invoiceAmount === null || b?.invoiceAmount === '') return undefined
  const carry = b.carry && typeof b.carry === 'object'
    ? { targetCutoff: typeof b.carry.targetCutoff === 'string' && b.carry.targetCutoff ? b.carry.targetCutoff : null, note: typeof b.carry.note === 'string' ? b.carry.note : null }
    : undefined
  return {
    siNumber: typeof b.siNumber === 'string' ? b.siNumber.slice(0, 40) : null,
    invoiceAmount: Number(b.invoiceAmount),
    carry,
    skipAdjustmentIds: Array.isArray(b.skipAdjustmentIds) ? b.skipAdjustmentIds.map(String) : [],
  }
}
