// A voided HMO session as a Session Adjustment (Hannah, 2026-11-09: "if it will
// be deleted, to have it in Revised Session Amount so that the PF can be revised
// if the order is voided and it was already paid out").
//
// Voiding an HMO order records one OrderHmoSettlement row marked HMO_VOID_REF:
// billed = the order's amount at the void, paid = 0. The row carries no ledger
// effect (the void itself reverses the sale) — it exists so the session shows
// in AR → Session Adjustments and so Payroll's HMO PF alerts, bell and payslip
// PF recovery treat the PF already released on it as overpaid, exactly as they
// do for a "Decrease due to HMO Payment".

import type { Prisma, PrismaClient } from '@prisma/client'

export const HMO_VOID_REF = 'ORDER VOIDED'

export const isVoidAdjustment = (s: { reference: string | null }) => s.reference === HMO_VOID_REF

/** Prisma filter: settlement rows that are real HMO decreases (not the void marker). Null references count. */
export const decreaseRowsOnly: Prisma.OrderHmoSettlementWhereInput = {
  OR: [{ reference: null }, { reference: { not: HMO_VOID_REF } }],
}

type Db = PrismaClient | Prisma.TransactionClient

interface VoidedOrder {
  id: string
  netAmount: Prisma.Decimal | number | string
  items: { id: string; name: string; quantity: number; unitPrice: Prisma.Decimal | number | string; lineTotal: Prisma.Decimal | number | string }[]
  payments: { id: string; method: string; walletId: string | null }[]
}

/**
 * Record the void of an HMO order as a session adjustment. No-op for orders
 * with no HMO payment, and idempotent (a second void of the same order adds
 * nothing). Returns the row id, or null when nothing was recorded.
 */
export async function recordHmoSessionVoid(db: Db, order: VoidedOrder, user: { id: string; name?: string | null }, reason?: string | null): Promise<string | null> {
  const hmo = order.payments.find(p => p.method === 'HMO')
  if (!hmo) return null
  const existing = await db.orderHmoSettlement.findFirst({ where: { orderId: order.id, reference: HMO_VOID_REF }, select: { id: true } })
  if (existing) return existing.id
  const billed = Math.round(Number(order.netAmount) * 100) / 100
  const row = await db.orderHmoSettlement.create({
    data: {
      orderId: order.id,
      paymentId: hmo.id,
      walletId: hmo.walletId,
      billedAmount: billed,
      paidAmount: 0,
      difference: billed,
      reference: HMO_VOID_REF,
      note: reason ? `Order voided: ${reason}` : 'Order voided',
      originalItems: order.items.map(i => ({
        id: i.id, name: i.name, quantity: i.quantity, unitPrice: Number(i.unitPrice), lineTotal: Number(i.lineTotal),
      })),
      glStatus: 'UNCHANGED (the void reverses the sale)',
      createdById: user.id,
      createdByName: user.name ?? null,
    },
    select: { id: true },
  })
  return row.id
}
