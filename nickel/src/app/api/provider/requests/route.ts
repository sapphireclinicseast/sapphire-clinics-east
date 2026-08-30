import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionProvider } from '@/lib/auth'

// Open patient requests a verified provider can reach out to: in a city they
// cover, matching their profession (or unspecified), that they haven't already
// offered on.
export async function GET() {
  const provider = await getSessionProvider()
  if (!provider) return NextResponse.json({ requests: [], eligible: false })
  const eligible = provider.active && provider.verificationStatus === 'VERIFIED'
  if (!eligible) return NextResponse.json({ requests: [], eligible: false })

  const rows = await prisma.patientRequest.findMany({
    where: {
      status: 'OPEN',
      city: { in: provider.citiesCovered },
      OR: [{ profession: null }, { profession: provider.profession }],
    },
    orderBy: { createdAt: 'desc' },
    take: 60,
    include: {
      patient: { select: { firstName: true } },
      offers: { where: { providerId: provider.id, status: { in: ['PENDING', 'ACCEPTED'] } }, select: { id: true } },
    },
  })

  const requests = rows.map((r) => ({
    id: r.id, city: r.city, profession: r.profession,
    patientName: r.patient.firstName,
    preferredDate: r.preferredDate ? r.preferredDate.toISOString().slice(0, 10) : null,
    preferredTime: r.preferredTime, flexibility: r.flexibility, note: r.note,
    createdAt: r.createdAt.toISOString(),
    alreadyOffered: r.offers.length > 0,
  }))
  return NextResponse.json({ requests, eligible: true, rate: provider.rate != null ? Number(provider.rate) : null })
}
