import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionClinic } from '@/lib/auth'
import { clinicWalletMove, providerWalletMove } from '@/lib/wallet'

// Clinic pays a therapist's cut for a completed clinic-wallet visit — moves the
// cut from the clinic wallet into the therapist's Nickel wallet.
export async function POST(req: NextRequest) {
  const clinic = await getSessionClinic()
  if (!clinic) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { bookingId?: string }
  const bookingId = String(b.bookingId ?? '')

  const bk = await prisma.booking.findFirst({
    where: { id: bookingId, clinicId: clinic.id },
    select: { id: true, status: true, paymentRouting: true, therapistCut: true, providerId: true, payoutStatus: true },
  })
  if (!bk) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
  if (bk.paymentRouting !== 'CLINIC_WALLET') return NextResponse.json({ error: 'This visit pays the therapist directly.' }, { status: 409 })
  if (bk.status !== 'COMPLETED') return NextResponse.json({ error: 'You can pay the therapist once the visit is completed.' }, { status: 409 })
  if (bk.payoutStatus === 'PAID') return NextResponse.json({ error: 'Already paid.' }, { status: 409 })
  const cut = Math.round(Number(bk.therapistCut ?? 0) * 100) / 100
  if (cut <= 0) return NextResponse.json({ error: 'No therapist cut set for this visit.' }, { status: 409 })
  if (Number(clinic.walletBalance) < cut) return NextResponse.json({ error: 'Your clinic wallet balance is too low.' }, { status: 409 })

  await prisma.$transaction(async (tx) => {
    await clinicWalletMove(tx, clinic.id, { amount: -cut, type: 'PAYOUT', bookingId, note: 'Therapist cut' })
    await providerWalletMove(tx, bk.providerId, { amount: cut, type: 'EARNING', bookingId, note: 'Clinic paid your cut' })
    await tx.booking.update({ where: { id: bookingId }, data: { payoutStatus: 'PAID' } })
  })
  return NextResponse.json({ ok: true, paid: cut })
}
