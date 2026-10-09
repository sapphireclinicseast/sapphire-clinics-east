import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isLikelyChinoy } from '@/lib/chinoy-surnames'
import { classifyDiagnosis, familiesForTags } from '@/lib/diagnosis-taxonomy'

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
      diagnoses:   true,
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
  // Grouped into families rather than counted per raw string. The field is free
  // text written by three different sources over the years, so one condition
  // arrives under a dozen spellings — "ASD / Autism Spectrum Disorder", the same
  // in caps from the QR form, plain "ASD", "MILD AUTISM", "ASD LEVEL 2" — and
  // counting strings turned the single largest group in the clinic into five
  // separate bars, none of which showed its real size. See lib/diagnosis-taxonomy.
  //
  // A patient with two conditions is counted in BOTH families, so the bars sum
  // to more than the number of patients. That is the honest reading of "ASD,
  // ADHD": filing that child under one of the two would hide the other.
  // diagnosisDenominator is what the percentages are out of.
  const diagMap: Record<string, { male: number; female: number; other: number }> = {}
  let diagnosedPatients = 0
  for (const p of patients) {
    // A tagged record needs no guessing — each tag is already one condition, so
    // "Anxiety and Depression" arrives as two entries rather than as a string
    // something has to split. Untagged records fall back to reading the free
    // text, which is every record created before tagging existed.
    const tags = (p.diagnoses ?? []).filter((t) => t && t.trim())
    let families: string[]
    if (tags.length) {
      // Tags are still free text, so they go through the same classifier — it
      // collapses "Speech Delay" and "Language Disorder" into one family.
      families = familiesForTags(tags)
      if (!families.length) continue
    } else {
      if (!p.diagnosis?.trim()) continue
      const m = classifyDiagnosis(p.diagnosis)
      // "FOR OT AND PT", "N/A", and the occasional address typed into the box are
      // not conditions; "T/C ADHD" is a differential, not a diagnosis.
      if (m.nonClinical || m.provisional || !m.families.length) continue
      families = m.families
    }
    diagnosedPatients++
    const sex = p.sex?.toLowerCase() ?? ''
    const bucket = sex.startsWith('m') ? 'male' : sex.startsWith('f') ? 'female' : 'other'
    for (const name of families) {
      if (!diagMap[name]) diagMap[name] = { male: 0, female: 0, other: 0 }
      diagMap[name][bucket]++
    }
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
    .map(({ name, male, female, other, total }) => ({
      name,
      male,
      female,
      other,
      // Share of diagnosed patients carrying this condition. Rounded to 0.1 so
      // the chart does not have to decide; sums past 100% by design.
      pct: diagnosedPatients
        ? Math.round((1000 * total) / diagnosedPatients) / 10
        : 0,
    }))

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
      diagnoses,         // family-grouped; male/female/other + pct per family
      // Denominator behind `pct` — patients with a usable diagnosis, counted once
      // each even when they carry several conditions.
      diagnosedPatients,
      locations,         // barangay+city for precise choropleth
      cities,            // city-level fallback
      branchDist: branchMap,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
