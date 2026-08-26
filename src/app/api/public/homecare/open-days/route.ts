// GET /api/public/homecare/open-days?cityId=&branch= — upcoming, enabled open
// travel dates (with remaining seats) for a city + serving branch. Feeds the
// date-picker step of the /homecare flow.

import { NextRequest, NextResponse } from 'next/server'
import { preflight, withCors } from '../../_cors'
import { upcomingOpenDays, isShortBranch } from '@/lib/homecare'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const cityId = req.nextUrl.searchParams.get('cityId') ?? ''
  const branchParam = req.nextUrl.searchParams.get('branch') ?? undefined
  if (!cityId) {
    return withCors(NextResponse.json({ error: 'cityId is required' }, { status: 400 }), origin)
  }
  const branch = isShortBranch(branchParam) ? branchParam : undefined
  const days = (await upcomingOpenDays(cityId, branch)).filter((d) => d.remaining > 0)
  return withCors(NextResponse.json({ openDays: days }), origin)
}
