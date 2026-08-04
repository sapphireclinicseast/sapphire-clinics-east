import { prisma } from '@/lib/prisma'

// The two shapes a POS settlement reaches the bank in: one sale settling on its
// own, or a day's takings on one payment mode settled as a single deposit —
// both net of the mode's deductions (merchant discount, withholding). Payments
// already claimed by a settlement batch are excluded so a deposit can't be
// suggested against money that another deposit already covered.
//
// Used by the Match modal's suggestions; the grid's yellow hints compute the
// same shapes (match-hints route) — keep the math in step.

export interface PosSingle {
  paymentId: string; modeId: string; modeName: string
  date: Date; gross: number; net: number
  orderNumber: number; name: string
}
export interface PosDay {
  key: string; modeId: string; modeName: string; date: Date
  n: number; gross: number; net: number
  paymentIds: string[]
  items: { orderNumber: number; name: string; net: number }[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function netOfDeductions(gross: number, deductions: { rate: any; valueType: string }[]): number {
  const cut = (deductions || []).reduce((s, d) =>
    s + (d.valueType === 'PERCENTAGE' ? gross * Number(d.rate) / 100 : Number(d.rate)), 0)
  return Math.round((gross - cut) * 100) / 100
}

export async function posSettlementShapes(bankAccountId: string, lo: Date, hi: Date): Promise<{ singles: PosSingle[]; days: PosDay[] }> {
  const modes = await prisma.paymentMode.findMany({
    where: { accountId: bankAccountId },
    select: { id: true, name: true, deductions: { select: { rate: true, valueType: true } } },
  })
  if (!modes.length) return { singles: [], days: [] }

  const payments = await prisma.orderPayment.findMany({
    where: {
      paymentModeId: { in: modes.map(m => m.id) },
      order: { status: 'COMPLETED', transactionDate: { gte: lo, lte: hi } },
    },
    select: {
      id: true, amount: true, paymentModeId: true,
      order: { select: { orderNumber: true, transactionDate: true, patientName: true, buyerName: true } },
    },
  })
  if (!payments.length) return { singles: [], days: [] }

  const settled = new Set((await prisma.posSettlementPayment.findMany({
    where: { orderPaymentId: { in: payments.map(p => p.id) } },
    select: { orderPaymentId: true },
  })).map(s => s.orderPaymentId))

  const singles: PosSingle[] = []
  const days = new Map<string, PosDay>()
  for (const p of payments) {
    if (!p.order || !p.paymentModeId || settled.has(p.id)) continue
    const mode = modes.find(m => m.id === p.paymentModeId)!
    const net = netOfDeductions(Number(p.amount), mode.deductions)
    const name = p.order.patientName || p.order.buyerName || ''
    singles.push({ paymentId: p.id, modeId: mode.id, modeName: mode.name, date: p.order.transactionDate, gross: Number(p.amount), net, orderNumber: p.order.orderNumber, name })
    const key = `${p.order.transactionDate.toISOString().slice(0, 10)}|${mode.id}`
    const cur = days.get(key)
    if (cur) {
      cur.n++; cur.gross = Math.round((cur.gross + Number(p.amount)) * 100) / 100
      cur.net = Math.round((cur.net + net) * 100) / 100
      cur.paymentIds.push(p.id)
      cur.items.push({ orderNumber: p.order.orderNumber, name, net })
    } else {
      days.set(key, { key, modeId: mode.id, modeName: mode.name, date: p.order.transactionDate, n: 1, gross: Number(p.amount), net, paymentIds: [p.id], items: [{ orderNumber: p.order.orderNumber, name, net }] })
    }
  }
  return { singles, days: [...days.values()] }
}
