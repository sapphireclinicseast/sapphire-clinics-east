import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'HMO_OFFICER']

export async function GET() {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const settings = await prisma.soaSettings.findUnique({ where: { id: 'singleton' } })
    return NextResponse.json(settings || { id: 'singleton' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const {
      clinicName, clinicAddress,
      bankName, bankBranch, bankAccountName, bankAccountNo,
      hmoOfficerName, hmoOfficerEsigUrl,
      clinicManagerName, clinicManagerEsigUrl,
      contactEmail, contactPhone1, contactPhone2,
    } = body

    const data = {
      clinicName: clinicName ?? null,
      clinicAddress: clinicAddress ?? null,
      bankName: bankName ?? null,
      bankBranch: bankBranch ?? null,
      bankAccountName: bankAccountName ?? null,
      bankAccountNo: bankAccountNo ?? null,
      hmoOfficerName: hmoOfficerName ?? null,
      hmoOfficerEsigUrl: hmoOfficerEsigUrl ?? null,
      clinicManagerName: clinicManagerName ?? null,
      clinicManagerEsigUrl: clinicManagerEsigUrl ?? null,
      contactEmail: contactEmail ?? null,
      contactPhone1: contactPhone1 ?? null,
      contactPhone2: contactPhone2 ?? null,
    }

    const settings = await prisma.soaSettings.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    })
    return NextResponse.json(settings)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
