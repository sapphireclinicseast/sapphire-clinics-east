// GET /api/public/stats
// Public, unauthenticated, CORS-enabled aggregate counts for the marketing
// landing page hero (sapphireclinicseast.org). Returns ONLY two non-PII
// totals — patients served and confirmed sessions — so the homepage numbers
// stay in sync with live operations data instead of going stale by hand.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { preflight, withCors } from '../_cors'

// Always compute fresh — these counts grow continuously.
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')

  // patients = every Patient row (all branches, mirrors Patient Dashboard
  // "Total Patients"); sessions = CONFIRMED schedules (mirrors Clinic
  // Utilization's confirmed count).
  const [patients, sessions] = await Promise.all([
    prisma.patient.count(),
    prisma.schedule.count({ where: { status: 'CONFIRMED' } }),
  ])

  return withCors(
    NextResponse.json(
      { patients, sessions },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    ),
    origin,
  )
}
