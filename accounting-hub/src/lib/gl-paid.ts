// Is a patient's GL wallet (guarantee letter) paid? GL is collected PER
// APPLICATION, never per session: an OP/agency check is recorded against the
// GL wallet in AR → GL → Payment History (an ARPayment with no session items),
// or the GL case is marked paid. Same rule as Detailed GL (paid = any ARPayment
// on the wallet OR GlCase.paidAt). Used by POS (order chips, wallet popup).

import type { PrismaClient } from '@prisma/client'

export interface GlPaid { date: string; amount: number }

export async function glWalletsPaid(prisma: PrismaClient, walletIds: string[]): Promise<Map<string, GlPaid>> {
  const ids = [...new Set(walletIds.filter(Boolean))]
  const out = new Map<string, GlPaid>()
  if (!ids.length) return out
  const [pays, cases] = await Promise.all([
    prisma.aRPayment.groupBy({ by: ['walletId'], where: { walletId: { in: ids } }, _max: { paymentDate: true }, _sum: { amount: true } }),
    prisma.glCase.findMany({ where: { walletId: { in: ids }, paidAt: { not: null } }, select: { walletId: true, paidAt: true } }),
  ])
  for (const p of pays) {
    if (p._max.paymentDate) out.set(p.walletId, { date: p._max.paymentDate.toISOString(), amount: Number(p._sum.amount || 0) })
  }
  for (const c of cases) {
    if (c.walletId && c.paidAt && !out.has(c.walletId)) out.set(c.walletId, { date: c.paidAt.toISOString(), amount: 0 })
  }
  return out
}
