import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Branch role → branch enum mapping
function branchFromRole(role: string): string | null {
  if (role === 'SBEA_FRONT_DESK' || role === 'SBEA_ADMIN') return 'SBEA'
  if (role === 'SBGH_FRONT_DESK' || role === 'SBGH_ADMIN') return 'SBGH'
  return null
}

// Lists Progress Reports relevant to the front desk dashboard.
// ?status=pending  → informed by clinician but NOT yet emailed to patient (active widget)
// ?status=sent     → already emailed to patient (history widget)
// ?search=...      → match patient first/last name (case-insensitive)
//
// Front desk users see only PRs for patients in their branch.
// Admin / super admin sees everything.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const role = user?.role ?? ''
  const branchScope = branchFromRole(role)

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'pending'
  const search = (searchParams.get('search') ?? '').trim()

  // Build where filter
  const where: any = { documentType: 'PROGRESS_REPORT' }
  if (status === 'pending') {
    where.informedFrontDeskAt = { not: null }
    where.emailedToPatientAt = null
  } else if (status === 'sent') {
    where.emailedToPatientAt = { not: null }
  }

  // Branch scoping: only show PRs for patients in this branch
  if (branchScope) {
    where.patient = {
      OR: [
        { branch: branchScope },
        { branches: { has: branchScope } },
      ],
    }
  }

  // Search by patient name
  if (search) {
    where.patient = {
      ...(where.patient ?? {}),
      OR: [
        ...(where.patient?.OR ?? []),
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ],
    }
    // If branch scoping is also active, combine both with AND
    if (branchScope && where.patient.OR) {
      where.patient = {
        AND: [
          { OR: [{ branch: branchScope }, { branches: { has: branchScope } }] },
          { OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
          ] },
        ],
      }
    }
  }

  // @ts-ignore — patientDocument added to schema in this PR
  const docs = await prisma.patientDocument.findMany({
    where,
    select: {
      id: true,
      fileName: true,
      filePath: true,
      mimeType: true,
      department: true,
      description: true,
      createdAt: true,
      informedFrontDeskAt: true,
      paidForAt: true,
      emailedToPatientAt: true,
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          branch: true,
          branches: true,
          patientType: true,
        },
      },
    },
    orderBy: status === 'sent'
      ? { emailedToPatientAt: 'desc' }
      : { informedFrontDeskAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({ documents: docs })
}
