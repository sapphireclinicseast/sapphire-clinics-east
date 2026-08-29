import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth'
import { computeSplit } from '@/lib/earnings'

// Settle a provider's pending balance: bundle their unpaid PAID bookings into a
// Payout batch and flip them to payoutStatus=PAID. (The actual bank/GCash
// transfer is done manually by finance; this records that it happened.)
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { providerId?: string; reference?: string; note?: string }
  const providerId = String(b.providerId ?? '')
  if (!providerId) return NextResponse.json({ error: 'Missing providerId' }, { status: 400 })

  const provider = await prisma.provider.findUnique({ where: { id: providerId } })
  if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })

  const due = await prisma.booking.findMany({
    where: { providerId, status: { in: ['PAID', 'CONFIRMED', 'COMPLETED'] }, payoutStatus: 'PENDING' },
    select: { id: true, amount: true, providerNet: true },
  })
  if (due.length === 0) return NextResponse.json({ error: 'Nothing to pay out.' }, { status: 409 })

  const total = due.reduce((s, x) => s + (x.providerNet != null ? Number(x.providerNet) : computeSplit(Number(x.amount)).net), 0)
  const method = provider.bankName
    ? `${provider.bankName} ${provider.bankAccountNo ?? ''}`.trim()
    : provider.gcashNumber ? `GCash ${provider.gcashNumber}` : null

  const payout = await prisma.$transaction(async (tx) => {
    const p = await tx.payout.create({ data: { providerId, amount: total, method, reference: b.reference?.trim() || null, note: b.note?.trim() || null } })
    await tx.booking.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { payoutStatus: 'PAID', payoutId: p.id } })
    return p
  })
  return NextResponse.json({ ok: true, payoutId: payout.id, amount: total, sessions: due.length })
}
