import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchHrPartnerInstitutions } from '@/lib/external-staff'

// Recipients of pre-numbered forms (e.g. referral forms): partner SCHOOLS from
// the HR Partnerships module + our referring DOCTORS (we hand them the referral
// form too). Other HR institution types (clinic / NGO / government / athletic)
// are intentionally excluded. Schools sync live from HR; doctors come from the
// Referrer table (type DOCTOR, active).
const isSchool = (typeId?: string, label?: string) =>
  typeId === 'school' || /school|college|university|academ/i.test(label || '')

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [institutions, doctors] = await Promise.all([
    fetchHrPartnerInstitutions(),
    prisma.referrer.findMany({
      where: { type: 'DOCTOR', isActive: true },
      select: { id: true, name: true, specialization: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const schools = institutions
    .filter((i) => isSchool(i.type, i.typeLabel))
    .map((i) => ({ id: i.id, name: i.name, kind: 'School' as const, detail: undefined as string | undefined }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const docs = doctors.map((d) => ({
    id: d.id, name: d.name, kind: 'Doctor' as const, detail: d.specialization || undefined,
  }))

  return NextResponse.json({ data: [...schools, ...docs] })
}
