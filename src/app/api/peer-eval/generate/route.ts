import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const CLINICAL_DEPTS = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS']
const ADMIN_DEPTS = ['ADMINISTRATION']
const EXCLUDED_TITLES = new Set(['CEO', 'President', 'ceo', 'president', 'Chief Executive Officer', 'ceo-and-president'])

// Staff permanently excluded from ALL peer-eval generation (assessor and assessee).
// Matches by staff ID (primary) or full name (fallback for re-created records).
const EXCLUDED_STAFF_IDS  = new Set([
  'system-admin-staff',          // System Administrator (SBEA · ADMINISTRATION)
  'cmmro4a7z000001jorb6aoh8q',   // HANNAH JARA       (SBGH · ADMINISTRATION)
  'cmnmxmfxf000001p9p66a31fu',   // HANNAH PELLEJO    (SBEA · ADMINISTRATION)
])
const EXCLUDED_STAFF_NAMES = new Set([
  'SYSTEM ADMINISTRATOR',
  'HANNAH JARA',
  'HANNAH PELLEJO',
])
function isExcluded(s: { id: string; firstName: string; lastName: string; jobTitle?: string | null }): boolean {
  if (EXCLUDED_STAFF_IDS.has(s.id)) return true
  if (EXCLUDED_STAFF_NAMES.has(`${s.firstName} ${s.lastName}`)) return true
  if (EXCLUDED_TITLES.has(s.jobTitle ?? '')) return true
  return false
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN'].includes(role))
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const { formType, branch, year, month } = await req.json()
  if (!formType || !branch || !year)
    return NextResponse.json({ error: 'formType, branch, year required' }, { status: 400 })

  let created = 0
  let skipped = 0
  const errors: string[] = []

  if (formType === 'HR08_ADMIN') {
    // FRONT_DESK staff assess ALL clinical staff in branch
    const allAdminStaff = await prisma.staff.findMany({ where: { branch, department: { in: ADMIN_DEPTS as any } } })
    const adminStaff = allAdminStaff.filter(s => !isExcluded(s))
    const allClinicalStaff = await prisma.staff.findMany({ where: { branch, department: { in: CLINICAL_DEPTS as any } } })
    const clinicalStaff = allClinicalStaff.filter(s => !isExcluded(s))

    for (const assessor of adminStaff) {
      for (const assessee of clinicalStaff) {
        try {
          await prisma.peerEvalAssignment.create({
            data: { formType: 'HR08_ADMIN', assessorId: assessor.id, assesseeId: assessee.id, branch, periodYear: year, periodMonth: 0 }
          })
          created++
        } catch { skipped++ }
      }
    }
  }

  else if (formType === 'HR08_PEER') {
    // Clinical staff assess same-dept, same-day peers
    // Each assessee gets at least 2 assessors
    const configs = await prisma.deckingTherapistConfig.findMany({
      where: { branch },
      include: { staff: true },
    })
    const configMap = new Map(configs.map(c => [c.staffId, c.workDays as string[]]))

    const allClinicalStaff08p = await prisma.staff.findMany({
      where: { branch, department: { in: CLINICAL_DEPTS as any } }
    })
    const clinicalStaff = allClinicalStaff08p.filter(s => !isExcluded(s))

    // Group by department
    const byDept = new Map<string, typeof clinicalStaff>()
    for (const s of clinicalStaff) {
      const arr = byDept.get(s.department) ?? []
      arr.push(s)
      byDept.set(s.department, arr)
    }

    for (const [, deptStaff] of byDept) {
      for (const assessee of deptStaff) {
        const assesseeDays = new Set(configMap.get(assessee.id) ?? [])
        if (assesseeDays.size === 0) continue

        // Find peers who share at least 1 day
        const candidates = deptStaff.filter(s => {
          if (s.id === assessee.id) return false
          const days = configMap.get(s.id) ?? []
          return days.some(d => assesseeDays.has(d))
        })

        if (candidates.length === 0) continue

        // Shuffle and take at least 2
        const shuffled = seededShuffle(candidates, year * 100 + assessee.id.charCodeAt(0))
        const assessors = shuffled.slice(0, Math.max(2, Math.min(shuffled.length, 3)))

        for (const assessor of assessors) {
          try {
            await prisma.peerEvalAssignment.create({
              data: { formType: 'HR08_PEER', assessorId: assessor.id, assesseeId: assessee.id, branch, periodYear: year, periodMonth: 0 }
            })
            created++
          } catch { skipped++ }
        }
      }
    }
  }

  else if (formType === 'HR09_CLINICAL') {
    // HR09 CLINICAL — annual; each admin staff member assessed by ≥10 randomly selected clinical staff
    const allAdminStaff09c = await prisma.staff.findMany({ where: { branch, department: { in: ADMIN_DEPTS as any } } })
    const adminStaff = allAdminStaff09c.filter(s => !isExcluded(s))
    const allClinicalStaff09c = await prisma.staff.findMany({ where: { branch, department: { in: CLINICAL_DEPTS as any } } })
    const clinicalStaff = allClinicalStaff09c.filter(s => !isExcluded(s))

    if (adminStaff.length === 0) return NextResponse.json({ error: 'No admin staff found for this branch' }, { status: 400 })
    if (clinicalStaff.length === 0) return NextResponse.json({ error: 'No clinical staff found for this branch' }, { status: 400 })

    const MIN_ASSESSORS_CLINICAL = 10

    for (const assessee of adminStaff) {
      const seed = year * 10000 + assessee.id.charCodeAt(0)
      const shuffled = seededShuffle(clinicalStaff, seed)
      const assessors = shuffled.slice(0, Math.max(MIN_ASSESSORS_CLINICAL, shuffled.length))

      for (const assessor of assessors) {
        try {
          await prisma.peerEvalAssignment.create({
            data: { formType: 'HR09_CLINICAL', assessorId: assessor.id, assesseeId: assessee.id, branch, periodYear: year, periodMonth: 0 }
          })
          created++
        } catch { skipped++ }
      }
    }
  }

  else if (formType === 'HR09_ADMIN') {
    // HR09 ADMIN — annual; each admin staff member assessed by ≥5 randomly selected admin peers
    const allAdminStaff09a = await prisma.staff.findMany({ where: { branch, department: { in: ADMIN_DEPTS as any } } })
    const adminStaff = allAdminStaff09a.filter(s => !isExcluded(s))

    if (adminStaff.length === 0) return NextResponse.json({ error: 'No admin staff found for this branch' }, { status: 400 })

    const MIN_ASSESSORS_ADMIN = 5

    for (const assessee of adminStaff) {
      // Peers = all admin staff except the assessee themselves
      const peers = adminStaff.filter(s => s.id !== assessee.id)
      if (peers.length === 0) { skipped++; continue }

      const seed = year * 20000 + assessee.id.charCodeAt(0)
      const shuffled = seededShuffle(peers, seed)
      const assessors = shuffled.slice(0, Math.max(MIN_ASSESSORS_ADMIN, shuffled.length))

      for (const assessor of assessors) {
        try {
          await prisma.peerEvalAssignment.create({
            data: { formType: 'HR09_ADMIN', assessorId: assessor.id, assesseeId: assessee.id, branch, periodYear: year, periodMonth: 0 }
          })
          created++
        } catch { skipped++ }
      }
    }
  }

  return NextResponse.json({ created, skipped, errors })
}
