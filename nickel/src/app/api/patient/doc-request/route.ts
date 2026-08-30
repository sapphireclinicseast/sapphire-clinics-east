import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId } from '@/lib/auth'
import { createPaymongoLink } from '@/lib/paymongo'

// Patient requests + pays for a Progress Report or Home Exercise Program from
// their therapist. On payment the therapist is alerted to prepare it.
export async function POST(req: NextRequest) {
  const patientId = await getSessionPatientId()
  if (!patientId) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { bookingId?: string; providerId?: string; type?: string }
  const type = String(b.type ?? '')
  if (!['PROGRESS_REPORT', 'HEP'].includes(type)) return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })

  let providerId = String(b.providerId ?? '')
  if (!providerId && b.bookingId) {
    const bk = await prisma.booking.findFirst({ where: { id: b.bookingId, patientId }, select: { providerId: true } })
    providerId = bk?.providerId ?? ''
  }
  if (!providerId) return NextResponse.json({ error: 'Missing therapist' }, { status: 400 })

  const provider = await prisma.provider.findUnique({ where: { id: providerId }, select: { firstName: true, lastName: true, priceProgressReport: true, priceHEP: true } })
  if (!provider) return NextResponse.json({ error: 'Therapist not found' }, { status: 404 })
  const price = type === 'PROGRESS_REPORT' ? provider.priceProgressReport : provider.priceHEP
  if (price == null || Number(price) <= 0) return NextResponse.json({ error: 'This therapist doesn’t offer that document.' }, { status: 409 })

  const label = type === 'PROGRESS_REPORT' ? 'Progress Report' : 'Home Exercise Program'
  const request = await prisma.docRequest.create({
    data: { patientId, providerId, bookingId: b.bookingId ?? null, type: type as never, amount: price },
    select: { id: true },
  })
  try {
    const link = await createPaymongoLink({ amountPhp: Number(price), description: `Nickel — ${label} from ${provider.firstName} ${provider.lastName}`, remarks: label })
    await prisma.docRequest.update({ where: { id: request.id }, data: { paymongoLinkId: link.id, checkoutUrl: link.checkoutUrl } })
    return NextResponse.json({ ok: true, checkoutUrl: link.checkoutUrl })
  } catch (e) {
    await prisma.docRequest.delete({ where: { id: request.id } }).catch(() => {})
    console.error('[nickel doc-request] paymongo failed:', e)
    return NextResponse.json({ error: 'Could not start payment. Please try again.' }, { status: 502 })
  }
}
