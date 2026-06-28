// GET /api/progress-reports — list PRs by status, branch-scoped.
// status=pending  : informedFrontDeskAt set, emailedToPatientAt null
// status=past     : emailedToPatientAt set
// status=all      : all PRs

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ROLE_BRANCH: Record<string, string> = {
  AHEA_FRONT_DESK: 'SBEA',
  AHGH_FRONT_DESK: 'SBGH',
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string }).role ?? ''
  const forcedBranch = ROLE_BRANCH[role] ?? null

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'pending'
  const branch = forcedBranch ?? searchParams.get('branch')
  const search = (searchParams.get('search') ?? '').trim().toLowerCase()

  // Branch-scope via patient.branches OR patient.branch
  // We use raw SQL to avoid enum array type issues with Prisma + branches []
  let patientIds: string[] | null = null
  if (branch) {
    const branchEnum = branch === 'SBEA' ? 'SANDBOX_EAST' : branch === 'SBGH' ? 'SANDBOX_GREENHILLS' : branch
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Patient" WHERE branch::text = $1 OR $1 = ANY("branches"::text[])`,
      branchEnum,
    )
    patientIds = rows.map(r => r.id)
  }

  const where: Record<string, unknown> = {
    documentType: 'PROGRESS_REPORT',
    ...(patientIds !== null ? { patientId: { in: patientIds } } : {}),
  }

  if (status === 'pending') {
    Object.assign(where, {
      informedFrontDeskAt: { not: null },
      emailedToPatientAt: null,
    })
  } else if (status === 'past') {
    Object.assign(where, { emailedToPatientAt: { not: null } })
  }

  const docs = await prisma.patientDocument.findMany({
    where,
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  // Server-side name filter (since the search needs to match across joined table)
  const filtered = search
    ? docs.filter(d => {
        const fn = (d.patient.firstName ?? '').toLowerCase()
        const ln = (d.patient.lastName ?? '').toLowerCase()
        return fn.includes(search) || ln.includes(search) || (ln + ' ' + fn).includes(search)
      })
    : docs

  return NextResponse.json({
    docs: filtered.map(d => ({
      id: d.id,
      fileName: d.fileName,
      mimeType: d.mimeType,
      department: d.department,
      createdAt: d.createdAt,
      informedFrontDeskAt: d.informedFrontDeskAt,
      paidForAt: d.paidForAt,
      paid: !!d.paidForAt,
      emailedToPatientAt: d.emailedToPatientAt,
      patient: d.patient,
    })),
  })
}
