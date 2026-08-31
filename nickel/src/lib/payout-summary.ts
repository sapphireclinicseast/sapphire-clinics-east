import { prisma } from '@/lib/prisma'
import { PAYOUT_HOLD_DAYS } from '@/lib/earnings'

const r2 = (n: number) => Math.round(n * 100) / 100

// Split a provider's/doctor's unpaid earnings into what's payable now (matured
// past the settlement hold) vs still maturing, and when the next credit matures.
export async function payoutSummary(where: { providerId?: string; doctorId?: string }) {
  const now = new Date()
  const holdCutoff = new Date(now.getTime() - PAYOUT_HOLD_DAYS * 86400_000)
  const rows = await prisma.walletTransaction.findMany({
    where: { ...where, type: 'EARNING', payoutId: null, amount: { gt: 0 } },
    select: { amount: true, payoutEligibleAt: true, createdAt: true },
  })
  let available = 0, maturing = 0
  let nextEligibleAt: Date | null = null
  for (const row of rows) {
    const at = row.payoutEligibleAt ?? new Date(row.createdAt.getTime() + PAYOUT_HOLD_DAYS * 86400_000)
    if (at <= now) available += Number(row.amount)
    else { maturing += Number(row.amount); if (!nextEligibleAt || at < nextEligibleAt) nextEligibleAt = at }
  }
  return { available: r2(available), maturing: r2(maturing), nextEligibleAt }
}

// The next scheduled payout run (cron: Wednesdays 07:00 UTC = 15:00 Manila).
export function nextPayoutRun(from = new Date()): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 7, 0, 0))
  // day 3 = Wednesday
  let add = (3 - d.getUTCDay() + 7) % 7
  if (add === 0 && from.getTime() > d.getTime()) add = 7 // today's run already passed
  d.setUTCDate(d.getUTCDate() + add)
  return d
}
