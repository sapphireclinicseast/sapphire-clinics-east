import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isLikelyChinoy } from '@/lib/chinoy-surnames'

// Never cache — branch filter query param must always be respected
export const dynamic = 'force-dynamic'

function getAge(dob: Date): number {
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age
}

const AGE_GROUPS = [
  { label: '0–4',   min: 0,  max: 4   },
  { label: '5–9',   min: 5,  max: 9   },
  { label: '10–14', min: 10, max: 14  },
  { label: '15–17', min: 15, max: 17  },
  { label: '18–24', min: 18, max: 24  },
  { label: '25–34', min: 25, max: 34  },
  { label: '35–44', min: 35, max: 44  },
  { label: '45–54', min: 45, max: 54  },
  { label: '55–64', min: 55, max: 64  },
  { label: '65+',   min: 65, max: 999 },
]

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Branch filter ────────────────────────────────────────────────────────────
  // ?branches=SANDBOX_EAST,SANDBOX_GREENHILLS,VERDANA_STORE  (omit = show all)
  const branchParam = req.nextUrl.searchParams.get('branches')
  console.log('[stats] GET called | branchParam:', branchParam, '| url:', req.nextUrl.toString())

  // Parse the requested branches (plain strings — no Prisma enum dependency)
  const filterBranches: string[] | null = branchParam
    ? branchParam.split(',').map((b) => b.trim()).filter(Boolean)
    : null

  console.log('[stats] filterBranches:', filterBranches)

  // ── Fetch ALL patients (no DB-level filter) ───────────────────────────────
  // We filter in JS to avoid Prisma PrismaPg adapter enum-array limitations.
  // Dataset is ~2k patients with minimal fields — fast and reliable.
  const allPatients = await prisma.patient.findMany({
    select: {
      lastName:    true,
      dob:         true,
      sex:         true,
      diagnosis:   true,
      city:        true,
      address:     true,   // used as barangay label in the choropleth
      branches:    true,
      branch:      true,
      patientType: true,
    },
  })

  console.log('[stats] total from DB (unfiltered):', allPatients.length)

  // ── Apply branch filter in JavaScript ──────────────────────────────────────
  const patients = filterBranches && filterBranches.length > 0
    ? allPatients.filter((p) => {
        // Check multi-branch array first, fall back to legacy single-branch field
        const patientBranches: string[] = p.branches.length > 0
          ? (p.branches as unknown as string[])
          : (p.branch ? [p.branch as unknown as string] : [])
        return patientBranches.some((b) => filterBranches.includes(b))
      })
    : allPatients

  const total = patients.length
  console.log('[stats] patients after filter:', total, '| filter:', filterBranches)

  const pediatricCount      = patients.filter((p) => p.patientType === 'PEDIATRIC').length
  const adultCount          = patients.filter((p) => p.patientType === 'ADULT').length
  const filipinoChineseCount = patients.filter((p) => isLikelyChinoy(p.lastName)).length

  // ── Age statistics (mean, median, mode) ──────────────────────────────────────
  const ages = patients
    .filter((p) => p.dob)
    .map((p) => getAge(new Date(p.dob!)))
    .sort((a, b) => a - b)

  const meanAge = ages.length > 0
    ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)
    : null

  const medianAge = ages.length > 0
    ? ages.length % 2 === 0
      ? Math.round((ages[ages.length / 2 - 1] + ages[ages.length / 2]) / 2)
      : ages[Math.floor(ages.length / 2)]
    : null

  let modeAge: number | null = null
  if (ages.length > 0) {
    const freq: Record<number, number> = {}
    for (const a of ages) freq[a] = (freq[a] ?? 0) + 1
    let maxFreq = 0
    for (const [age, count] of Object.entries(freq)) {
      if (count > maxFreq) { maxFreq = count; modeAge = Number(age) }
    }
  }

  // ── Age × sex population pyramid ─────────────────────────────────────────────
  const pyramid = AGE_GROUPS.map((g) => {
    const inGroup = patients.filter((p) => {
      if (!p.dob) return false
      const age = getAge(new Date(p.dob))
      return age >= g.min && age <= g.max
    })
    const male   = inGroup.filter((p) => p.sex?.toLowerCase().startsWith('m')).length
    const female = inGroup.filter((p) => p.sex?.toLowerCase().startsWith('f')).length
    const other  = inGroup.length - male - female
    return { label: g.label, male, female, other }
  })

  // ── Diagnoses × sex pyramid ───────────────────────────────────────────────────
  const diagMap: Record<string, { male: number; female: number; other: number }> = {}
  for (const p of patients) {
    if (!p.diagnosis?.trim()) continue
    const key = p.diagnosis.trim()
    if (!diagMap[key]) diagMap[key] = { male: 0, female: 0, other: 0 }
    const sex = p.sex?.toLowerCase() ?? ''
    if (sex.startsWith('m')) diagMap[key].male++
    else if (sex.startsWith('f')) diagMap[key].female++
    else diagMap[key].other++
  }
  const diagnoses = Object.entries(diagMap)
    .map(([name, { male, female, other }]) => ({
      name,
      male,
      female,
      other,
      total: male + female + other,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)
    .map(({ name, male, female, other }) => ({ name, male, female, other }))

  // ── Geographic locations (barangay + city) for choropleth ─────────────────────
  const locMap: Record<string, { barangay: string | null; city: string; count: number }> = {}
  for (const p of patients) {
    const city = p.city?.trim() || null
    if (!city) continue
    const addr = p.address?.trim() || null
    const barangay = addr && addr.length <= 60 ? addr : null
    const key = barangay ? `${barangay}||${city}` : city
    if (!locMap[key]) locMap[key] = { barangay, city, count: 0 }
    locMap[key].count++
  }
  const locations = Object.values(locMap).sort((a, b) => b.count - a.count)

  // ── Cities fallback ───────────────────────────────────────────────────────────
  const cityMap: Record<string, number> = {}
  for (const p of patients) {
    const city = p.city?.trim()
    if (city) cityMap[city] = (cityMap[city] ?? 0) + 1
  }
  const cities = Object.entries(cityMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  // ── Branch distribution ───────────────────────────────────────────────────────
  const branchMap: Record<string, number> = {}
  for (const p of patients) {
    const bs: string[] = p.branches.length > 0
      ? (p.branches as unknown as string[])
      : (p.branch ? [p.branch as unknown as string] : ['UNASSIGNED'])
    for (const b of bs) branchMap[b] = (branchMap[b] ?? 0) + 1
  }

  return NextResponse.json(
    {
      total,
      pediatricCount,
      adultCount,
      filipinoChineseCount,
      meanAge,
      medianAge,
      modeAge,
      avgAge: meanAge,   // backward compat alias
      pyramid,
      diagnoses,         // includes male/female/other per diagnosis
      locations,         // barangay+city for precise choropleth
      cities,            // city-level fallback
      branchDist: branchMap,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
