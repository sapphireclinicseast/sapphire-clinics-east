// GET /api/public/stats
// Public, unauthenticated, CORS-enabled aggregates for the marketing landing
// page hero (sapphireclinicseast.org). Returns ONLY non-PII totals — patients
// served, confirmed sessions, and the average satisfaction rating with the
// number of surveys behind it — so the homepage numbers stay in sync with live
// operations data instead of going stale by hand.
//
// The satisfaction figure was a hardcoded "4.64/5★" in js/main.js that nothing
// recalculated, drifting away from the real average as surveys came in. Serving
// it here is what lets the page stop guessing.

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
  //
  // satisfaction = the mean of every individual rating given, which is the
  // plain reading of "average rating out of 5". Averaging each survey first
  // and then averaging those would weight a survey with one question the same
  // as one with twelve.
  //
  // Aggregated in SQL rather than by reading the rows: this endpoint is public
  // and uncached on a cold hit, and the survey table only grows.
  const [patients, sessions, surveyRows] = await Promise.all([
    prisma.patient.count(),
    prisma.schedule.count({ where: { status: 'CONFIRMED' } }),
    prisma.$queryRaw<{ surveys: number; avg: string | null }[]>`
      SELECT count(DISTINCT sr.id)::int        AS surveys,
             avg((e->>'value')::numeric)       AS avg
      FROM "SurveyResponse" sr,
           LATERAL jsonb_array_elements(sr."responsesJson"::jsonb -> 'ratings') e
      WHERE jsonb_typeof(sr."responsesJson"::jsonb -> 'ratings') = 'array'
        AND (e->>'value') ~ '^[0-9]+(\.[0-9]+)?$'
    `,
  ])

  // Older surveys store answers as top-level q1/q2 keys with no ratings array
  // (two shapes live in this column). Those simply contribute nothing here
  // rather than being counted as zeros.
  const row = surveyRows?.[0]
  const rawAvg = row?.avg == null ? NaN : Number(row.avg)
  const satisfaction =
    Number.isFinite(rawAvg) && rawAvg > 0 && rawAvg <= 5
      ? Math.round(rawAvg * 100) / 100
      : null
  const surveyCount = row?.surveys ?? 0

  return withCors(
    NextResponse.json(
      { patients, sessions, satisfaction, surveyCount },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    ),
    origin,
  )
}
