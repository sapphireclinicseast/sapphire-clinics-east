// POST /api/internal/class-portal/backfill-patients
//
// One-shot: sync every existing class-portal STUDENT user into the marketing
// Patient CRM. Use this after the schema change ships to bring in students
// who enrolled before the auto-sync hook was wired up.
//
// Auth: EXTERNAL_API_KEY bearer (shared with /api/queue/external + the
// accounting-hub callback).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncStudentToPatientCrm } from '@/lib/class-portal-patient-sync'

const API_KEY = process.env.EXTERNAL_API_KEY || ''

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!API_KEY || auth !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const students = await prisma.classPortalUser.findMany({ where: { role: 'STUDENT' } })
  const results: Array<{ email: string; status: 'synced' | 'skipped' | 'failed'; error?: string }> = []
  for (const s of students) {
    try {
      const id = await syncStudentToPatientCrm({
        email: s.email,
        firstName: s.firstName,
        lastName: s.lastName,
        branch: s.branch as 'EAST' | 'GREENHILLS' | null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        enrollment: (s.enrollment as any) ?? null,
      })
      results.push({ email: s.email, status: id ? 'synced' : 'skipped' })
    } catch (e) {
      results.push({ email: s.email, status: 'failed', error: (e as Error).message })
    }
  }
  const synced = results.filter(r => r.status === 'synced').length
  return NextResponse.json({ total: students.length, synced, results })
}
