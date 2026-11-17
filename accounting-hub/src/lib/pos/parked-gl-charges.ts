// Parked GL cancellation fees (Hannah, 2026-11-18).
//
// A GL patient's cancellation fee goes on the guarantee letter they were using
// on the day. When that letter had nothing left (used up, or less than the fee),
// the fee is parked in ParkedGlCharge instead of being dropped. It goes onto the
// patient's next letter: automatically when front desk adds that letter (POST
// /api/pos/wallets), or with "Charge to this letter" in the wallet view.
//
// Each fee becomes an ordinary POS order paid by the letter (one path for the
// wallet deduction and the journal entry), dated on the cancellation so it sits
// in the running balance where it happened, with the retroactive marker so it
// shows in its own colour (lib/pos/retro-cancellation).
import { prisma as defaultPrisma } from '@/lib/prisma'
import { POST as createPosOrder } from '@/app/api/pos/orders/route'
import { RETRO_CANCEL_MARKER } from '@/lib/pos/retro-cancellation'

type Db = typeof defaultPrisma

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const longDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
const manilaDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

/** Name on the order: the letter's name without "(2nd Application)". */
export const letterPatientName = (walletName: string) => walletName.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()

export interface ParkedSummary { count: number; amount: number }

/** Parked (not yet charged) fees per patient. */
export async function parkedByPatient(db: Db, patientIds?: string[]): Promise<Map<string, ParkedSummary>> {
  const rows = await db.parkedGlCharge.groupBy({
    by: ['patientId'],
    where: { status: 'PARKED', ...(patientIds ? { patientId: { in: patientIds } } : {}) },
    _count: { _all: true },
    _sum: { amount: true },
  })
  return new Map(rows.map(r => [r.patientId, { count: r._count._all, amount: Number(r._sum.amount || 0) }]))
}

export interface ChargeParkedResult {
  charged: { id: string; orderId: string; orderNumber: number | null; amount: number; eventDate: string }[]
  chargedAmount: number
  /** Still parked for this patient after the run (didn't fit on the letter). */
  left: number
  leftAmount: number
  error?: string
}

/**
 * Put the patient's parked fees on this guarantee letter, oldest first, as far
 * as its balance goes. Safe to call twice at once: each fee is claimed
 * (PARKED → CHARGING) before its order is made, and put back if that fails.
 */
export async function chargeParkedToLetter(db: Db, walletId: string, userId?: string | null): Promise<ChargeParkedResult> {
  const out: ChargeParkedResult = { charged: [], chargedAmount: 0, left: 0, leftAmount: 0 }
  const secret = process.env.NEXTAUTH_SECRET
  const wallet = await db.digitalWallet.findUnique({
    where: { id: walletId },
    select: { id: true, walletType: true, patientId: true, patientName: true, isActive: true, usedUpAt: true, balance: true },
  })
  if (!wallet || wallet.walletType !== 'GL') return { ...out, error: 'Not a guarantee letter' }
  const parked = await db.parkedGlCharge.findMany({
    where: { patientId: wallet.patientId, status: 'PARKED' },
    orderBy: [{ eventDate: 'asc' }, { createdAt: 'asc' }],
  })
  const tally = (rows: typeof parked) => {
    out.left = rows.length
    out.leftAmount = rows.reduce((s, r) => s + Number(r.amount), 0)
  }
  if (!parked.length) return out
  if (!wallet.isActive || wallet.usedUpAt) { tally(parked); return { ...out, error: 'This letter is closed' } }
  if (!secret) { tally(parked); return { ...out, error: 'NEXTAUTH_SECRET not set' } }

  let balance = Number(wallet.balance)
  const today = longDate(new Date())
  const remaining: typeof parked = []
  for (const p of parked) {
    const amount = Number(p.amount)
    if (balance + 0.005 < amount) { remaining.push(p); continue }
    const claim = await db.parkedGlCharge.updateMany({ where: { id: p.id, status: 'PARKED' }, data: { status: 'CHARGING' } })
    if (claim.count === 0) continue // another run has it
    const body = {
      orderType: 'SERVICE',
      branch: p.branch,
      patientId: wallet.patientId,
      patientName: letterPatientName(wallet.patientName),
      clinicianName: null,
      transactionDate: manilaDay(p.eventDate),
      items: [{ serviceId: p.serviceId, name: p.feeName, quantity: 1, unitPrice: amount, lineTotal: amount }],
      payments: [{ method: 'GL', amount, walletId: wallet.id }],
      revenueType: 'EARNED',
      notes: `${RETRO_CANCEL_MARKER} — ${p.detail}; parked on ${longDate(p.createdAt)} because no letter had room for it, charged to this letter on ${today}.`,
    }
    let res: Response
    try {
      res = await createPosOrder(new Request('http://internal/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
        body: JSON.stringify(body),
      }))
    } catch (e) {
      await db.parkedGlCharge.update({ where: { id: p.id }, data: { status: 'PARKED' } })
      remaining.push(p)
      out.error = `Could not charge ${peso(amount)} for ${longDate(p.eventDate)}: ${e instanceof Error ? e.message : String(e)}`
      break
    }
    const created = await res.json().catch(() => ({})) as { id?: string; orderNumber?: number; error?: string }
    if (res.status !== 201 || !created.id) {
      await db.parkedGlCharge.update({ where: { id: p.id }, data: { status: 'PARKED' } })
      remaining.push(p)
      out.error = `Could not charge ${peso(amount)} for ${longDate(p.eventDate)}: ${created.error || res.status}`
      break
    }
    await db.parkedGlCharge.update({
      where: { id: p.id },
      data: { status: 'CHARGED', orderId: created.id, chargedWalletId: wallet.id, chargedAt: new Date(), chargedById: userId || null },
    })
    balance -= amount
    out.charged.push({ id: p.id, orderId: created.id, orderNumber: created.orderNumber ?? null, amount, eventDate: manilaDay(p.eventDate) })
    out.chargedAmount += amount
  }
  // Whatever wasn't reached after a failure is still parked too.
  const done = new Set([...out.charged.map(c => c.id), ...remaining.map(r => r.id)])
  tally([...remaining, ...parked.filter(p => !done.has(p.id))])
  return out
}
