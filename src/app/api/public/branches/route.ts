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

  const branches = await prisma.hrBranch.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: 'asc' },
  })

  return withCors(NextResponse.json({ branches }), origin)
}
