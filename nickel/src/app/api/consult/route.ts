import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId } from '@/lib/auth'
import { isValidSlot, ymdToDate, manilaTodayYmd } from '@/lib/availability'
import { createPaymongoLink } from '@/lib/paymongo'

function addHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Patient books a rehab-doctor consult (teleconsult or in-person) → payment.
export async function POST(req: NextRequest) {
  const patientId = await getSessionPatientId()
  if (!patientId) return NextResponse.json({ error: 'Please sign in to book a consult.' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { doctorId?: string; mode?: string; date?: string; startTime?: string; reason?: string }
  const doctorId = String(b.doctorId ?? '')
  const mode = String(b.mode ?? '').toUpperCase()
  const date = String(b.date ?? ''); const startTime = String(b.startTime ?? '')
  if (!doctorId || !['TELECONSULT', 'IN_PERSON'].includes(mode) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) {
    return NextResponse.json({ error: 'Missing consult details' }, { status: 400 })
  }
  if (date < manilaTodayYmd()) return NextResponse.json({ error: 'That date has passed.' }, { status: 409 })

  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, include: { slots: true } })
  if (!doctor || !doctor.active || doctor.verificationStatus !== 'VERIFIED' || doctor.consultFee == null) return NextResponse.json({ error: 'Doctor is not available.' }, { status: 409 })
  if (mode === 'TELECONSULT' && !doctor.teleconsultEnabled) return NextResponse.json({ error: 'This doctor does not offer teleconsults.' }, { status: 409 })
  if (mode === 'IN_PERSON' && !doctor.inPersonEnabled) return NextResponse.json({ error: 'This doctor does not offer in-person consults.' }, { status: 409 })

  const rows = await prisma.consult.findMany({ where: { doctorId, date: { gte: ymdToDate(manilaTodayYmd()) }, status: { notIn: ['CANCELLED'] } }, select: { date: true, startTime: true } })
  const booked = new Set(rows.map((r) => `${r.date.toISOString().slice(0, 10)}|${r.startTime}`))
  if (!isValidSlot(doctor.slots, booked, date, startTime, 60)) return NextResponse.json({ error: 'That time is no longer available. Please pick another.' }, { status: 409 })

  const amount = Number(doctor.consultFee)
  const bookedDate = ymdToDate(date)

  let consult: { id: string }
  try {
    consult = await prisma.$transaction(async (tx) => {
      const clash = await tx.consult.count({ where: { doctorId, date: bookedDate, startTime, status: { notIn: ['CANCELLED'] } } })
      if (clash > 0) throw new Error('TAKEN')
      return tx.consult.create({
        data: { patientId, doctorId, mode: mode as 'TELECONSULT' | 'IN_PERSON', date: bookedDate, startTime, endTime: addHour(startTime), amount, reason: b.reason ? String(b.reason).slice(0, 500) : null, status: 'PENDING' },
        select: { id: true },
      })
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'TAKEN') return NextResponse.json({ error: 'That time was just booked. Please pick another.' }, { status: 409 })
    throw e
  }
  // Teleconsult room id is derived from the consult id.
  if (mode === 'TELECONSULT') await prisma.consult.update({ where: { id: consult.id }, data: { roomName: `nickel-consult-${consult.id}` } })

  try {
    const link = await createPaymongoLink({
      amountPhp: amount,
      description: `Nickel rehab-doctor consult — Dr. ${doctor.firstName} ${doctor.lastName} (${date} ${startTime})`,
      remarks: mode === 'TELECONSULT' ? 'Teleconsult (video)' : 'In-person clinic consult',
    })
    await prisma.consult.update({ where: { id: consult.id }, data: { paymongoLinkId: link.id, checkoutUrl: link.checkoutUrl } })
    return NextResponse.json({ consultId: consult.id, checkoutUrl: link.checkoutUrl })
  } catch (e) {
    await prisma.consult.delete({ where: { id: consult.id } }).catch(() => {})
    console.error('[nickel consult] paymongo failed:', e)
    return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 502 })
  }
}
