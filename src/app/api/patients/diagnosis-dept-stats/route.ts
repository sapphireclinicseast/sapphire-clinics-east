import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Never cache — branch filter query param must always be respected
export const dynamic = 'force-dynamic'

const DEPTS = ['OT', 'PT', 'SLP', 'SPED'] as const
type Dept = typeof DEPTS[number]

const TOP_DIAGNOSES = 12

/**
 * Diagnosis × Department × Sex — feeds the bubble chart on the Patient Dashboard.
 *
 * A patient counts once per (diagnosis, department) pair if they have at least
 * one CONFIRMED session with that department; `*Sessions` is the total number
 * of CONFIRMED sessions those patients have had with that department (same definition as
 * /api/patients/interdept-stats). A patient seen by two departments therefore
 * appears in both columns — cells are not additive across departments.
 *
 * ?branches=SANDBOX_EAST,SANDBOX_GREENHILLS,VERDANA_STORE  (omit = all)
 */
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
      staff:     { select: { department: true } },
      patient:   { select: { diagnosis: true, sex: true, branches: true, branch: true } },
    },
  })

  // patientId -> { diagnosis, sex, depts }
  const patients = new Map<string, { diagnosis: string; sex: 'male' | 'female' | 'other'; depts: Map<Dept, number> }>()

  for (const s of schedules) {
    if (!s.patientId || !s.patient) continue
    const dept = s.staff.department as Dept
    if (!DEPTS.includes(dept)) continue

    const diagnosis = s.patient.diagnosis?.trim()
    if (!diagnosis) continue

    if (filterBranches && filterBranches.length > 0) {
      const bs: string[] = (s.patient.branches as unknown as string[]).length > 0
        ? (s.patient.branches as unknown as string[])
        : s.patient.branch ? [s.patient.branch as unknown as string] : []
      if (!bs.some((b) => filterBranches.includes(b))) continue
    }

    let rec = patients.get(s.patientId)
    if (!rec) {
      const sx = s.patient.sex?.toLowerCase() ?? ''
      rec = {
        diagnosis,
        sex: sx.startsWith('m') ? 'male' : sx.startsWith('f') ? 'female' : 'other',
        depts: new Map(),
      }
      patients.set(s.patientId, rec)
    }
    rec.depts.set(dept, (rec.depts.get(dept) ?? 0) + 1) // sessions with this dept
  }

  // Rank diagnoses by unique patients (across departments) and keep the top N
  const diagTotals = new Map<string, number>()
  for (const p of patients.values()) diagTotals.set(p.diagnosis, (diagTotals.get(p.diagnosis) ?? 0) + 1)
  const diagnoses = [...diagTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_DIAGNOSES)
    .map(([name]) => name)
  const keep = new Set(diagnoses)

  const cellMap = new Map<string, {
    diagnosis: string; dept: Dept
    male: number; female: number; other: number                         // unique patients
    maleSessions: number; femaleSessions: number; otherSessions: number // confirmed sessions
  }>()
  for (const p of patients.values()) {
    if (!keep.has(p.diagnosis)) continue
    for (const [dept, sessions] of p.depts) {
      const key = `${p.diagnosis}||${dept}`
      let c = cellMap.get(key)
      if (!c) {
        c = {
          diagnosis: p.diagnosis, dept,
          male: 0, female: 0, other: 0,
          maleSessions: 0, femaleSessions: 0, otherSessions: 0,
        }
        cellMap.set(key, c)
      }
      c[p.sex]++
      c[`${p.sex}Sessions` as 'maleSessions' | 'femaleSessions' | 'otherSessions'] += sessions
    }
  }

  return NextResponse.json(
    { diagnoses, depts: DEPTS, cells: [...cellMap.values()] },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
