import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { patientWalletMove } from '@/lib/wallet'

// Patient cancels their own rehab-doctor consult. Any amount paid is refunded to
// their Nickel wallet.
export async function POST(req: NextRequest) {
  const patientId = await getSessionPatientId()
  if (!patientId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { consultId?: string }
  const consultId = String(b.consultId ?? '')

  const c = await prisma.consult.findFirst({ where: { id: consultId, patientId }, select: { id: true, status: true, patientId: true, doctorId: true, amount: true, date: true, startTime: true } })
  if (!c) return NextResponse.json({ error: 'Consult not found' }, { status: 404 })
  if (!['PENDING', 'PAID', 'CONFIRMED'].includes(c.status)) return NextResponse.json({ error: `Can't cancel a ${c.status.toLowerCase()} consult.` }, { status: 409 })

  let refunded = 0
  await prisma.$transaction(async (tx) => {
    await tx.consult.update({ where: { id: consultId }, data: { status: 'CANCELLED' } })
    if (['PAID', 'CONFIRMED'].includes(c.status)) { await patientWalletMove(tx, patientId, { amount: Number(c.amount), type: 'REFUND', note: 'You cancelled this consult' }); refunded = Number(c.amount) }
  })
  const when = `${c.date.toISOString().slice(0, 10)} at ${c.startTime}`
  await notify({ to: 'DOCTOR', doctorId: c.doctorId, consultId, type: 'CONSULT_CANCELLED', title: 'A consult was cancelled', body: `The patient cancelled the consult on ${when}.` })
  return NextResponse.json({ ok: true, refunded })
}
