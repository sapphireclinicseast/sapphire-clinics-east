import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth'
import { providerWalletMove } from '@/lib/wallet'

// Settle a provider's available wallet balance (earnings released on completed
// sessions): debit the wallet, record a Payout, and tag the covered completed
// sessions. The actual bank/GCash transfer is done manually by finance; this
// records that it happened.
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { providerId?: string; reference?: string; note?: string }
  const providerId = String(b.providerId ?? '')
  if (!providerId) return NextResponse.json({ error: 'Missing providerId' }, { status: 400 })

  const provider = await prisma.provider.findUnique({ where: { id: providerId } })
  if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })

  const total = Math.round(Number(provider.walletBalance) * 100) / 100
  if (total <= 0) return NextResponse.json({ error: 'Nothing to pay out.' }, { status: 409 })

  const method = provider.bankName
    ? `${provider.bankName} ${provider.bankAccountNo ?? ''}`.trim()
    : provider.gcashNumber ? `GCash ${provider.gcashNumber}` : null

  const result = await prisma.$transaction(async (tx) => {
    const p = await tx.payout.create({ data: { providerId, amount: total, method, reference: b.reference?.trim() || null, note: b.note?.trim() || null } })
    // Tag the earned, not-yet-settled completed sessions to this payout (record only).
    const covered = await tx.booking.updateMany({
      where: { providerId, status: 'COMPLETED', earnedAt: { not: null }, payoutStatus: 'PENDING' },
      data: { payoutStatus: 'PAID', payoutId: p.id },
    })
    await providerWalletMove(tx, providerId, { amount: -total, type: 'PAYOUT', payoutId: p.id, note: b.reference?.trim() ? `Ref ${b.reference.trim()}` : 'Payout' })
    return { p, sessions: covered.count }
  })
  return NextResponse.json({ ok: true, payoutId: result.p.id, amount: total, sessions: result.sessions })
}
