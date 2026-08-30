import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionClinic } from '@/lib/auth'
import { ymdToDate, manilaTodayYmd } from '@/lib/availability'
import { createPaymongoLink } from '@/lib/paymongo'
import { computeSplit, APP_FEE_PHP } from '@/lib/earnings'
import { notify } from '@/lib/notify'

function addHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// A verified clinic arranges a home visit for one of its patients with one of
// its therapists. Payment routing + collection mode decide the money flow.
export async function POST(req: NextRequest) {
  const clinic = await getSessionClinic()
  if (!clinic) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (clinic.verificationStatus !== 'VERIFIED') return NextResponse.json({ error: 'Your clinic must be verified first.' }, { status: 403 })

  const b = (await req.json().catch(() => ({}))) as { patientId?: string; providerId?: string; date?: string; startTime?: string; city?: string; routing?: string; collection?: string; price?: number; therapistCut?: number; notes?: string }
  const patientId = String(b.patientId ?? ''); const providerId = String(b.providerId ?? '')
  const date = String(b.date ?? ''); const startTime = String(b.startTime ?? '')
  const routing = b.routing === 'CLINIC_WALLET' ? 'CLINIC_WALLET' : 'THERAPIST_DIRECT'
  const collection = b.collection === 'OFFLINE' ? 'OFFLINE' : 'ONLINE'
  if (!patientId || !providerId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) return NextResponse.json({ error: 'Missing details' }, { status: 400 })
  if (date < manilaTodayYmd()) return NextResponse.json({ error: 'Pick a future date.' }, { status: 409 })

  const [patient, provider] = await Promise.all([
    prisma.patient.findFirst({ where: { id: patientId, clinicId: clinic.id }, select: { id: true } }),
    prisma.provider.findFirst({ where: { id: providerId, clinicId: clinic.id }, select: { id: true, firstName: true, lastName: true, rate: true, transpoIncluded: true } }),
  ])
  if (!patient) return NextResponse.json({ error: 'That patient is not in your clinic.' }, { status: 409 })
  if (!provider) return NextResponse.json({ error: 'That therapist is not in your clinic.' }, { status: 409 })

  // Amount the patient pays.
  let amount: number
  let therapistCut: number | null = null
  if (routing === 'CLINIC_WALLET') {
    amount = Math.round(Number(b.price ?? 0))
    therapistCut = Math.round(Number(b.therapistCut ?? 0))
    if (amount <= 0) return NextResponse.json({ error: 'Set the price the patient pays.' }, { status: 400 })
    if (therapistCut < 0 || therapistCut > amount) return NextResponse.json({ error: 'Therapist cut must be between 0 and the price.' }, { status: 400 })
  } else {
    if (provider.rate == null) return NextResponse.json({ error: 'This therapist has no rate set. Set one, or use the clinic-wallet option with a price.' }, { status: 409 })
    amount = Number(provider.rate)
  }

  const bookedDate = ymdToDate(date)
  const city = String(b.city ?? '').trim() || clinic.city || 'Metro Manila'

  // Reserve + create.
  let booking: { id: string }
  try {
    booking = await prisma.$transaction(async (tx) => {
      const clash = await tx.booking.count({ where: { providerId, date: bookedDate, startTime, status: { notIn: ['CANCELLED'] } } })
      if (clash > 0) throw new Error('TAKEN')
      const offline = collection === 'OFFLINE'
      const split = computeSplit(amount, { method: offline ? 'wallet' : 'card' }) // offline: no processing fee
      const created = await tx.booking.create({
        data: {
          patientId, providerId, clinicId: clinic.id, city, date: bookedDate, startTime, endTime: addHour(startTime),
          amount, transpoIncluded: provider.transpoIncluded, notes: b.notes ? String(b.notes).slice(0, 500) : null,
          paymentRouting: routing, collectionMode: collection, therapistCut,
          status: offline ? 'PAID' : 'PENDING',
          ...(offline ? { paidAt: new Date(), appFee: APP_FEE_PHP, processingFee: 0, providerNet: split.net, paymentMethod: 'offline' } : {}),
        },
        select: { id: true },
      })
      // Offline: clinic owes Nickel the flat platform fee.
      if (offline) await tx.clinic.update({ where: { id: clinic.id }, data: { feesOwed: { increment: APP_FEE_PHP } } })
      return created
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'TAKEN') return NextResponse.json({ error: 'That time is already booked for this therapist.' }, { status: 409 })
    throw e
  }

  if (collection === 'OFFLINE') {
    await notify({ to: 'PROVIDER', providerId, bookingId: booking.id, type: 'BOOKING_PAID', title: 'New clinic visit to confirm', body: `${clinic.name} arranged a home visit on ${date} at ${startTime}.` })
    return NextResponse.json({ ok: true, bookingId: booking.id, offline: true })
  }

  // Online: PayMongo checkout for the patient.
  try {
    const link = await createPaymongoLink({ amountPhp: amount, description: `Nickel home therapy — arranged by ${clinic.name} (${date} ${startTime})`, remarks: 'Clinic-arranged home visit' })
    await prisma.booking.update({ where: { id: booking.id }, data: { paymongoLinkId: link.id, checkoutUrl: link.checkoutUrl } })
    return NextResponse.json({ ok: true, bookingId: booking.id, checkoutUrl: link.checkoutUrl })
  } catch (e) {
    await prisma.booking.delete({ where: { id: booking.id } }).catch(() => {})
    console.error('[nickel clinic arrange] paymongo failed:', e)
    return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 502 })
  }
}
