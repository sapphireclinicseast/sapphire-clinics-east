import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const FOCUS_DEPTS = ['OT', 'PT', 'SLP', 'SPED'] as const
type Dept = (typeof FOCUS_DEPTS)[number]

const DEPT_COLORS: Record<Dept, string> = {
  OT:   '#1A7B8A',
  PT:   '#2AAABB',
  SLP:  '#F59E0B',
  SPED: '#8B5CF6',
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const branchParam = req.nextUrl.searchParams.get('branches')
  const filterBranches = branchParam
    ? branchParam.split(',').map((b) => b.trim()).filter(Boolean)
    : null

  // Fetch all confirmed schedules with staff department + patient branch info
  const schedules = await prisma.schedule.findMany({
    where: { status: 'CONFIRMED', patientId: { not: null } },
    select: {
      patientId: true,
      date:      true,
      staff:     { select: { department: true } },
      patient:   { select: { branches: true, branch: true } },
    },
  })

  // Branch filter in JS (mirrors /api/patients/stats pattern)
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

  // Keep only OT / PT / SLP / SPED
  const relevant = branchFiltered.filter((s) =>
    FOCUS_DEPTS.includes(s.staff.department as Dept)
  )

  // ── Build patient → Set<Dept> and month-dept session counts ─────────────────
  const patientDepts = new Map<string, Set<Dept>>()
  const monthDept: Record<string, Record<Dept, number>> = {}

  for (const s of relevant) {
    if (!s.patientId) continue
    const dept = s.staff.department as Dept

    if (!patientDepts.has(s.patientId)) patientDepts.set(s.patientId, new Set())
    patientDepts.get(s.patientId)!.add(dept)

    const d    = new Date(s.date)
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!monthDept[mKey]) monthDept[mKey] = { OT: 0, PT: 0, SLP: 0, SPED: 0 }
    monthDept[mKey][dept]++
  }

  const totalPatients = patientDepts.size

  // ── Single-dept patient counts ───────────────────────────────────────────────
  const deptCounts: Record<string, number> = { OT: 0, PT: 0, SLP: 0, SPED: 0 }
  for (const depts of patientDepts.values()) {
    for (const d of depts) deptCounts[d]++
  }

  // ── Co-occurrence helpers ────────────────────────────────────────────────────
  function countAtLeast(required: Dept[]): number {
    let n = 0
    for (const depts of patientDepts.values())
      if (required.every((d) => depts.has(d))) n++
    return n
  }

  // Pairwise counts
  const pair: Record<string, number> = {}
  for (const d1 of FOCUS_DEPTS)
    for (const d2 of FOCUS_DEPTS)
      if (d1 !== d2) pair[`${d1}_${d2}`] = countAtLeast([d1, d2])

  // Lift(A→B) = count(A∩B)·N / (count(A)·count(B))
  function lift(d1: Dept, d2: Dept): number {
    const co = pair[`${d1}_${d2}`]
    const cA = deptCounts[d1]
    const cB = deptCounts[d2]
    return cA && cB ? (co * totalPatients) / (cA * cB) : 0
  }

  // Confidence(A→B) = count(A∩B) / count(A)
  function confidence(d1: Dept, d2: Dept): number {
    return deptCounts[d1] ? pair[`${d1}_${d2}`] / deptCounts[d1] : 0
  }

  // ── Combination stats (the user's requested combos) ──────────────────────────
  const COMBOS: { label: string; depts: Dept[] }[] = [
    { label: 'OT + PT + SLP + SPED', depts: ['OT', 'PT', 'SLP', 'SPED'] },
    { label: 'OT + PT + SLP',        depts: ['OT', 'PT', 'SLP'] },
    { label: 'OT + PT + SPED',       depts: ['OT', 'PT', 'SPED'] },
    { label: 'OT + SLP + SPED',      depts: ['OT', 'SLP', 'SPED'] },
    { label: 'PT + SLP + SPED',      depts: ['PT', 'SLP', 'SPED'] },
    { label: 'OT + PT',              depts: ['OT', 'PT'] },
    { label: 'OT + SLP',             depts: ['OT', 'SLP'] },
    { label: 'OT + SPED',            depts: ['OT', 'SPED'] },
    { label: 'PT + SLP',             depts: ['PT', 'SLP'] },
    { label: 'PT + SPED',            depts: ['PT', 'SPED'] },
    { label: 'SLP + SPED',           depts: ['SLP', 'SPED'] },
  ]

  const comboStats = COMBOS.map(({ label, depts }) => {
    const count = countAtLeast(depts)
    return {
      label,
      depts,
      count,
      supportPct: totalPatients > 0 ? (count / totalPatients) * 100 : 0,
    }
  })

  // ── Affinity matrix (4×4, skipping diagonal) ─────────────────────────────────
  const affinityMatrix = FOCUS_DEPTS.map((d1) => ({
    dept:      d1,
    color:     DEPT_COLORS[d1],
    count:     deptCounts[d1],
    affinities: FOCUS_DEPTS.filter((d2) => d2 !== d1).map((d2) => ({
      target:        d2,
      color:         DEPT_COLORS[d2],
      confidencePct: Math.round(confidence(d1, d2) * 100),
      lift:          Number(lift(d1, d2).toFixed(2)),
      coCount:       pair[`${d1}_${d2}`],
    })),
  }))

  // ── Avg sessions per patient per month ───────────────────────────────────────
  // avg_per_patient_per_month = avg(monthly_sessions_in_dept) / patients_in_dept
  const months = Object.values(monthDept)
  const avgSessionsPerMonth: Record<string, number> = {}
  for (const dept of FOCUS_DEPTS) {
    const monthlyTotals = months.map((m) => m[dept] ?? 0).filter((c) => c > 0)
    const avgMonthlyTotal = monthlyTotals.length
      ? monthlyTotals.reduce((a, b) => a + b, 0) / monthlyTotals.length
      : 0
    avgSessionsPerMonth[dept] =
      deptCounts[dept] > 0
        ? Number((avgMonthlyTotal / deptCounts[dept]).toFixed(2))
        : 0
  }

  return NextResponse.json({
    totalPatients,
    deptCounts,
    comboStats,
    affinityMatrix,
    avgSessionsPerMonth,
  })
}
