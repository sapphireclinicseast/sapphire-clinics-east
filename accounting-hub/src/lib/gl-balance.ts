// A guarantee letter pays only up to what is left on it: OP settles the
// approved amount and no more, so a session charged past the balance is a
// session nobody pays for (Marcos Roa Mendoza, Sep 2026: his first letter went
// ₱2,195 below zero while his second letter sat unused). The POS checks every
// GL payment line against the letter's remaining balance before saving.
import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

export interface GlOverdraw {
  walletId: string
  walletName: string
  available: number
  requested: number
  /** The patient's other letters with money left — where the rest can go. */
  nextGl: { id: string; name: string; balance: number }[]
}

// "MARCOS ROA MENDOZA (2nd Application)" → "MARCOSROAMENDOZA"
const baseName = (s: string) => s.replace(/\([^)]*\)/g, '').toUpperCase().replace(/[^A-Z]/g, '')
const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * GL lines that charge a letter more than it has left. `credit` is what this
 * order already holds on each letter (an edit puts that back before
 * re-applying), so re-saving an order unchanged never trips the check.
 */
export async function glOverdraws(
  db: Db,
  payments: { method?: string; amount?: number | string; walletId?: string | null }[],
  credit: Map<string, number> = new Map(),
): Promise<GlOverdraw[]> {
  const want = new Map<string, number>()
  for (const p of payments) {
    if (p.method !== 'GL' || !p.walletId) continue
    want.set(p.walletId, (want.get(p.walletId) || 0) + (Number(p.amount) || 0))
  }
  if (!want.size) return []
  const wallets = await db.digitalWallet.findMany({
    where: { id: { in: [...want.keys()] } },
    select: { id: true, patientName: true, patientId: true, balance: true },
  })
  const out: GlOverdraw[] = []
  for (const w of wallets) {
    const available = r2(Number(w.balance) + (credit.get(w.id) || 0))
    const requested = r2(want.get(w.id) || 0)
    if (requested <= available + 0.005) continue
    const siblings = await db.digitalWallet.findMany({
      where: {
        walletType: 'GL', isActive: true, id: { not: w.id }, balance: { gt: 0 },
        ...(w.patientId ? { OR: [{ patientId: w.patientId }, { patientName: { contains: w.patientName.replace(/\s*\([^)]*\)\s*/g, '').trim(), mode: 'insensitive' } }] }
          : { patientName: { contains: w.patientName.replace(/\s*\([^)]*\)\s*/g, '').trim(), mode: 'insensitive' } }),
      },
      select: { id: true, patientName: true, balance: true },
      orderBy: { createdAt: 'asc' },
    })
    out.push({
      walletId: w.id, walletName: w.patientName, available: Math.max(0, available), requested,
      nextGl: siblings
        .filter(s => baseName(s.patientName) === baseName(w.patientName))
        .map(s => ({ id: s.id, name: s.patientName, balance: r2(Number(s.balance)) })),
    })
  }
  return out
}

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function glOverdrawMessage(o: GlOverdraw): string {
  const rest = r2(o.requested - o.available)
  const next = o.nextGl[0]
  return `${o.walletName}'s GL has only ${peso(o.available)} left, but this charges ${peso(o.requested)} to it. ` +
    (o.available > 0 ? `Put ${peso(o.available)} on this GL and the remaining ${peso(rest)} ` : `Put the ${peso(rest)} `) +
    (next ? `on ${next.name} (${peso(next.balance)} left) or another payment.` : 'on another payment — OP will not pay beyond the approved amount.')
}
