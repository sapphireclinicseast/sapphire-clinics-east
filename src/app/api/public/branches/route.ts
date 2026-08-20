// GET /api/public/branches
// Unauthenticated read of the locally-synced HR Branch Registry cache
// (see /api/branches/sync). This is the endpoint Class Portal and Client
// Portal reach through their existing booking-proxy relay — neither app
// has its own database, so this is how they learn branch names/contact
// info/departments/hours without hardcoding a copy.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { preflight, withCors } from '../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const { searchParams } = new URL(req.url)
  const includeInactive = searchParams.get('includeInactive') === '1'

  // Field allowlist — this endpoint is unauthenticated. TIN and every
  // email address (main/hr/accounting/payslips/schedules/sessionNotes)
  // are internal routing/business details, not patient-facing "contact
  // us" info, so they're excluded even though the underlying row has
  // them. Phone/address are kept — legitimately public (how a patient
  // reaches or visits the branch).
  const branches = await prisma.hrBranch.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: 'asc' },
    select: {
      id: true, shortCode: true, name: true, brandName: true,
      address: true, phone: true,
      departmentsOffered: true, operatingDays: true,
      operatingHoursOpen: true, operatingHoursClose: true,
      active: true,
      opsHubBranch: true, opsHubClassPortalBranch: true,
    },
  })

  return withCors(NextResponse.json({ branches }), origin)
}
