import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId } from '@/lib/auth'

// The patient's referrals issued by Nickel rehab-doctor consults, reusable when
// booking PT. (We return metadata only, not the file blob.)
export async function GET() {
  const patientId = await getSessionPatientId()
  if (!patientId) return NextResponse.json({ referrals: [] })
  const rows = await prisma.consult.findMany({
    where: { patientId, referralIssued: true },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    include: { doctor: { select: { firstName: true, lastName: true, postNominals: true } } },
  })
  return NextResponse.json({
    referrals: rows.map((c) => ({
      consultId: c.id,
      date: c.date.toISOString().slice(0, 10),
      doctorName: `Dr. ${c.doctor.firstName} ${c.doctor.lastName}${c.doctor.postNominals ? `, ${c.doctor.postNominals}` : ''}`,
    })),
  })
}
