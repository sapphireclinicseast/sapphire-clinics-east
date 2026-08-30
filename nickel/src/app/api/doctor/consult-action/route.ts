import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionDoctorId } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { patientWalletMove, releaseConsultEarning } from '@/lib/wallet'

// Doctor acts on one of their consults.
// action: confirm | decline | complete | issue-referral
export async function POST(req: NextRequest) {
  const did = await getSessionDoctorId()
  if (!did) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { consultId?: string; action?: string; note?: string; referralFile?: string }
  const consultId = String(b.consultId ?? '')
  const action = String(b.action ?? '')

  const c = await prisma.consult.findFirst({
    where: { id: consultId, doctorId: did },
    select: { id: true, status: true, patientId: true, doctorId: true, amount: true, doctorNet: true, earnedAt: true, date: true, startTime: true, mode: true, doctor: { select: { firstName: true, lastName: true } } },
  })
  if (!c) return NextResponse.json({ error: 'Consult not found' }, { status: 404 })
  const drName = `Dr. ${c.doctor.firstName} ${c.doctor.lastName}`
  const when = `${c.date.toISOString().slice(0, 10)} at ${c.startTime}`

  if (action === 'confirm') {
    if (c.status !== 'PAID') return NextResponse.json({ error: `Can't confirm a ${c.status.toLowerCase()} consult.` }, { status: 409 })
    await prisma.consult.update({ where: { id: consultId }, data: { status: 'CONFIRMED' } })
    await notify({ to: 'PATIENT', patientId: c.patientId, consultId, type: 'CONSULT_CONFIRMED', title: 'Your consult is confirmed', body: `${drName} confirmed your ${c.mode === 'TELECONSULT' ? 'teleconsult' : 'clinic consult'} on ${when}.` })
    return NextResponse.json({ ok: true, status: 'CONFIRMED' })
  }

  if (action === 'decline') {
    if (!['PAID', 'CONFIRMED', 'PENDING'].includes(c.status)) return NextResponse.json({ error: 'Cannot decline this consult.' }, { status: 409 })
    let refunded = 0
    await prisma.$transaction(async (tx) => {
      await tx.consult.update({ where: { id: consultId }, data: { status: 'CANCELLED' } })
      if (['PAID', 'CONFIRMED'].includes(c.status)) refunded = await patientWalletMove(tx, c.patientId, { amount: Number(c.amount), type: 'REFUND', note: 'Consult cancelled' }).then(() => Number(c.amount))
    })
    await notify({ to: 'PATIENT', patientId: c.patientId, consultId, type: 'CONSULT_CANCELLED', title: 'Consult cancelled', body: `${drName} cancelled your consult on ${when}.${refunded > 0 ? ` ₱${Math.round(refunded).toLocaleString('en-PH')} was refunded to your Nickel wallet.` : ''}` })
    return NextResponse.json({ ok: true, status: 'CANCELLED', refunded })
  }

  if (action === 'complete') {
    if (c.status !== 'CONFIRMED') return NextResponse.json({ error: 'Confirm the consult before completing it.' }, { status: 409 })
    const referralFile = typeof b.referralFile === 'string' && b.referralFile.startsWith('data:') ? b.referralFile : null
    await prisma.$transaction(async (tx) => {
      await tx.consult.update({ where: { id: consultId }, data: { status: 'COMPLETED', doctorNotes: b.note ? String(b.note).slice(0, 2000) : undefined, ...(referralFile ? { referralIssued: true, referralFile } : {}) } })
      await releaseConsultEarning(tx, c)
    })
    if (referralFile) await notify({ to: 'PATIENT', patientId: c.patientId, consultId, type: 'REFERRAL_READY', title: 'Your referral is ready', body: `${drName} issued your doctor's referral. You can now use it to book a PT home visit.` })
    else await notify({ to: 'PATIENT', patientId: c.patientId, consultId, type: 'CONSULT_COMPLETED', title: 'Consult completed', body: `Your consult with ${drName} is marked completed.` })
    return NextResponse.json({ ok: true, status: 'COMPLETED' })
  }

  if (action === 'issue-referral') {
    if (!['CONFIRMED', 'COMPLETED'].includes(c.status)) return NextResponse.json({ error: 'The consult must be confirmed first.' }, { status: 409 })
    const referralFile = typeof b.referralFile === 'string' && b.referralFile.startsWith('data:') ? b.referralFile : null
    if (!referralFile) return NextResponse.json({ error: 'Attach the referral document.' }, { status: 400 })
    await prisma.consult.update({ where: { id: consultId }, data: { referralIssued: true, referralFile } })
    await notify({ to: 'PATIENT', patientId: c.patientId, consultId, type: 'REFERRAL_READY', title: 'Your referral is ready', body: `${drName} issued your doctor's referral. You can now use it to book a PT home visit.` })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
