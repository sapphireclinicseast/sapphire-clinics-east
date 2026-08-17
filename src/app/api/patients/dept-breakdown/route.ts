// GET /api/patients/dept-breakdown?branches=SANDBOX_EAST,...
//
// Unique patients receiving each department's service, based on CONFIRMED
// sessions. Powers the "Patients by Service" section of the Patient Dashboard.
//
// Separate from /api/patients/interdept-stats on purpose: that route is scoped
// to FOCUS_DEPTS (OT/PT/SLP/SPED) because its affinity matrix and χ² p-values
// are computed for exactly those 4 (Bonferroni-corrected for 6 pairs). Widening
// that constant would silently invalidate the stated α. This route carries no
// such statistics, so it can cover every department.
//
// A patient counted under two departments appears in both counts, so the
// per-department figures intentionally sum to MORE than totalPatients — that
// overlap is what the interdepartmental section exists to explain.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Order mirrors the dashboard section. SLP is included so the breakdown
// accounts for every service line — omitting a real department would make the
// section read as though that service doesn't exist.
const DEPTS = ['PT', 'OT', 'SLP', 'MD', 'PSYCHOLOGY', 'ORTHOSIS', 'SPED'] as const
type Dept = (typeof DEPTS)[number]

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const branchParam = req.nextUrl.searchParams.get('branches')
  const filterBranches = branchParam
    ? branchParam.split(',').map((b) => b.trim()).filter(Boolean)
    : null

  const schedules = await prisma.schedule.findMany({
    where: { status: 'CONFIRMED', patientId: { not: null } },
    select: {
      patientId: true,
      staff:   { select: { department: true } },
      patient: { select: { branches: true, branch: true } },
    },
  })

  // Branch filter applied in JS, mirroring /api/patients/stats and
  // interdept-stats — the Prisma PG adapter can't filter on the enum array.
  const branchFiltered = filterBranches
    ? schedules.filter((s) => {
        if (!s.patient) return false
        const bs: string[] =
          (s.patient.branches as unknown as string[]).length > 0
            ? (s.patient.branches as unknown as string[])
            : s.patient.branch
            ? [s.patient.branch as unknown as string]
            : []
        return bs.some((b) => filterBranches.includes(b))
      })
    : schedules

  // patient → set of departments seen. Counting distinct patients (not
  // sessions) is what makes this a patient breakdown rather than a volume one.
  const patientDepts = new Map<string, Set<string>>()
  for (const s of branchFiltered) {
    if (!s.patientId) continue
    const dept = s.staff.department
    if (!patientDepts.has(s.patientId)) patientDepts.set(s.patientId, new Set())
    patientDepts.get(s.patientId)!.add(dept)
  }

  const counts = Object.fromEntries(DEPTS.map((d) => [d, 0])) as Record<Dept, number>
  for (const depts of patientDepts.values()) {
    for (const d of depts) {
      if ((DEPTS as readonly string[]).includes(d)) counts[d as Dept]++
    }
  }

  // Denominator = patients with at least one confirmed session in ANY listed
  // department, so the percentages describe "share of treated patients".
  const totalPatients = Array.from(patientDepts.values())
    .filter((set) => Array.from(set).some((d) => (DEPTS as readonly string[]).includes(d)))
    .length

  return NextResponse.json({
    totalPatients,
    departments: DEPTS.map((d) => ({
      dept: d,
      count: counts[d],
      pct: totalPatients > 0 ? Math.round((counts[d] / totalPatients) * 1000) / 10 : 0,
    })),
  })
}
