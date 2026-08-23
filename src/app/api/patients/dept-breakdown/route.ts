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
import { loadPosHistory } from '@/lib/pos-history'

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
      date:      true,
      staff:   { select: { department: true } },
      patient: { select: { branches: true, branch: true } },
    },
  })

  // The Schedule table only goes back as far as the Clinic Schedule module has
  // been in use (currently ~Mar 2026), while Patient holds the full historical
  // roster. Without surfacing both numbers and the window, "899 patients" reads
  // against a 2,760-patient roster as though two thirds are inactive — which is
  // an artefact of missing session history, not a clinical fact.
  const totalRoster = await prisma.patient.count()

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

  // ── Merge POS order history from the Accounting Hub ──────────────────────
  // Schedule starts ~Mar 2026; POS orders go back to Jun 2024. Identity
  // matching lives in lib/pos-history so this route and interdept-stats can't
  // drift apart. Additive: if the Accounting Hub is unreachable the section
  // still renders from Schedule data alone.
  const pos = await loadPosHistory(filterBranches, DEPTS)
  let histFrom: string | null = null
  const match = pos?.match ?? { byId: 0, byName: 0, byNameVariant: 0, unmatched: 0, ambiguous: 0 }
  if (pos) {
    histFrom = pos.window.from
    for (const [key, depts] of pos.patientDepts) {
      if (!patientDepts.has(key)) patientDepts.set(key, new Set())
      for (const d of depts) patientDepts.get(key)!.add(d)
    }
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

  const dates = branchFiltered.map((s) => s.date).filter(Boolean) as Date[]
  let earliest = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null
  const latest  = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null
  // POS history predates Schedule, so it sets the true start of the window.
  if (histFrom) {
    const h = new Date(`${histFrom}T00:00:00.000Z`)
    if (!earliest || h < earliest) earliest = h
  }

  return NextResponse.json({
    totalPatients,
    totalRoster,
    sessionWindow: {
      from: earliest ? earliest.toISOString().slice(0, 10) : null,
      to:   latest   ? latest.toISOString().slice(0, 10)   : null,
    },
    match,
    departments: DEPTS.map((d) => ({
      dept: d,
      count: counts[d],
      pct: totalPatients > 0 ? Math.round((counts[d] / totalPatients) * 1000) / 10 : 0,
    })),
  })
}
