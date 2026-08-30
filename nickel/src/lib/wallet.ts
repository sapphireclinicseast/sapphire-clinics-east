import { prisma } from '@/lib/prisma'
import { computeSplit } from '@/lib/earnings'
import type { Prisma } from '@prisma/client'

// A Prisma client OR an interactive-transaction client — wallet moves should run
// inside the same transaction as the state change that triggers them.
type Client = typeof prisma | Prisma.TransactionClient

const r2 = (n: number) => Math.round(n * 100) / 100

type Move = {
  amount: number // signed: + credit, − debit
  type: string
  bookingId?: string | null
  payoutId?: string | null
  note?: string | null
}

// Move money in a PATIENT's wallet and write a ledger entry. Returns new balance.
export async function patientWalletMove(db: Client, patientId: string, m: Move): Promise<number> {
  const p = await db.patient.update({ where: { id: patientId }, data: { walletBalance: { increment: r2(m.amount) } }, select: { walletBalance: true } })
  const balance = Number(p.walletBalance)
  await db.walletTransaction.create({ data: { patientId, amount: r2(m.amount), balance, type: m.type, bookingId: m.bookingId ?? null, payoutId: m.payoutId ?? null, note: m.note ?? null } })
  return balance
}

// Move money in a PROVIDER's wallet and write a ledger entry. Returns new balance.
export async function providerWalletMove(db: Client, providerId: string, m: Move): Promise<number> {
  const p = await db.provider.update({ where: { id: providerId }, data: { walletBalance: { increment: r2(m.amount) } }, select: { walletBalance: true } })
  const balance = Number(p.walletBalance)
  await db.walletTransaction.create({ data: { providerId, amount: r2(m.amount), balance, type: m.type, bookingId: m.bookingId ?? null, payoutId: m.payoutId ?? null, note: m.note ?? null } })
  return balance
}

type RefundBooking = {
  id: string; patientId: string; providerId: string; status: string
  amount: Prisma.Decimal | number; walletApplied: Prisma.Decimal | number
  providerNet: Prisma.Decimal | number | null; earnedAt: Date | null; refundedAt: Date | null
}

// Cancel-and-refund: return what the patient paid into their Nickel wallet, and
// (if the provider was already paid for this session) claw that earning back.
// Idempotent — a booking already refunded is skipped. Returns amount refunded.
export async function refundBookingToWallet(db: Client, b: RefundBooking, note = 'Booking cancelled'): Promise<number> {
  if (b.refundedAt) return 0
  const paid = ['PAID', 'CONFIRMED', 'COMPLETED'].includes(b.status)
  // If the session was paid, the patient is owed the full charge back (whether they
  // paid by card, credit, or a mix). If it never got past PENDING, only the store
  // credit they redeemed is returned (the card side was never charged).
  const refund = r2(paid ? Number(b.amount) : Number(b.walletApplied))
  if (refund > 0) await patientWalletMove(db, b.patientId, { amount: refund, type: 'REFUND', bookingId: b.id, note })
  if (b.earnedAt && b.providerNet != null) {
    await providerWalletMove(db, b.providerId, { amount: -Number(b.providerNet), type: 'ADJUSTMENT', bookingId: b.id, note: 'Reversed — session refunded' })
  }
  await db.booking.update({ where: { id: b.id }, data: { refundedAt: new Date() } })
  return refund
}

// Release a completed session's net earnings into the provider's wallet. Idempotent.
export async function releaseEarning(db: Client, b: { id: string; providerId: string; amount: Prisma.Decimal | number; providerNet: Prisma.Decimal | number | null; earnedAt: Date | null }): Promise<number> {
  if (b.earnedAt) return 0
  const net = b.providerNet != null ? Number(b.providerNet) : computeSplit(Number(b.amount)).net
  await providerWalletMove(db, b.providerId, { amount: net, type: 'EARNING', bookingId: b.id, note: 'Session completed' })
  await db.booking.update({ where: { id: b.id }, data: { earnedAt: new Date() } })
  return net
}
