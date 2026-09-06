import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatient } from '@/lib/auth'
import { createPaymongoLink } from '@/lib/paymongo'

// Patient adds refundable store credit to their Nickel wallet via PayMongo.
export async function POST(req: NextRequest) {
  const patient = await getSessionPatient()
  if (!patient) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { amount?: number | string }
  const amount = Math.floor(Number(b.amount))
  if (!Number.isFinite(amount) || amount < 100) return NextResponse.json({ error: 'Minimum top-up is ₱100.' }, { status: 400 })
  if (amount > 50000) return NextResponse.json({ error: 'Maximum top-up is ₱50,000.' }, { status: 400 })

  const topup = await prisma.walletTopup.create({ data: { patientId: patient.id, amount, status: 'PENDING' }, select: { id: true } })
  try {
    const link = await createPaymongoLink({ amountPhp: amount, description: `Nickel wallet top-up — ${patient.firstName} ${patient.lastName}`, remarks: `topup:${topup.id}` })
    await prisma.walletTopup.update({ where: { id: topup.id }, data: { paymongoLinkId: link.id, checkoutUrl: link.checkoutUrl } })
    return NextResponse.json({ ok: true, checkoutUrl: link.checkoutUrl })
  } catch (e) {
    await prisma.walletTopup.delete({ where: { id: topup.id } }).catch(() => {})
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not start payment.' }, { status: 502 })
  }
}
