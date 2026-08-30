import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/auth'
import { doctorWalletMove } from '@/lib/wallet'

// Settle a doctor's available wallet balance (earnings from completed consults).
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { doctorId?: string; reference?: string }
  const doctorId = String(b.doctorId ?? '')
  if (!doctorId) return NextResponse.json({ error: 'Missing doctorId' }, { status: 400 })

  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, select: { walletBalance: true } })
  if (!doctor) return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })
  const total = Math.round(Number(doctor.walletBalance) * 100) / 100
  if (total <= 0) return NextResponse.json({ error: 'Nothing to pay out.' }, { status: 409 })

  await prisma.$transaction(async (tx) => {
    await tx.consult.updateMany({ where: { doctorId, status: 'COMPLETED', earnedAt: { not: null }, payoutStatus: 'PENDING' }, data: { payoutStatus: 'PAID' } })
    await doctorWalletMove(tx, doctorId, { amount: -total, type: 'PAYOUT', note: b.reference?.trim() ? `Ref ${b.reference.trim()}` : 'Payout' })
  })
  return NextResponse.json({ ok: true, amount: total })
}
