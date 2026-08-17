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

// Order-insensitive, punctuation-insensitive token set. POS history stores a
// single free-text patientName whose word order isn't consistent
// ("ZAPATA ENRICO" vs "Enrico Zapata"), so comparing sorted token sets matches
// 93% of the name-only history where naive string equality matches almost none.
function nameKey(s: string): string {
  return s
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z ]/g, ' ')
    .split(/\s+/).filter(Boolean).sort().join(' ')
}

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
  // Operations Hub's Schedule table only starts ~Mar 2026; POS orders go back
  // to Jun 2024. Without this the breakdown undercounts every department by
  // 3-4x and reads as though most of the roster is untreated.
  let histFrom: string | null = null
  // byNameVariant is tracked separately from byName because it is the least
  // certain match tier — see subsetMatch below for the risk it carries.
  const match = { byId: 0, byName: 0, byNameVariant: 0, unmatched: 0, ambiguous: 0 }

  const acctUrl = process.env.ACCOUNTING_HUB_URL ?? 'https://accounting.sapphireclinicseast.org'
  const acctKey = process.env.EXTERNAL_API_KEY ?? ''
  if (acctKey) {
    try {
      const qs = filterBranches ? `?branches=${filterBranches.join(',')}` : ''
      const res = await fetch(`${acctUrl}/api/internal/dept-patient-history${qs}`, {
        headers: { Authorization: `Bearer ${acctKey}` },
        cache: 'no-store',
      })
      if (res.ok) {
        const hist = await res.json() as {
          window: { from: string | null; to: string | null }
          rows: { patientId: string | null; patientName: string | null; dept: string }[]
        }
        histFrom = hist.window?.from ?? null

        // Resolve POS identities onto this hub's patients. Exact id first —
        // 917 of 924 ids in the POS data are this hub's Patient.id. Names are
        // the fallback for the migrated 2024-25 history, which has no ids.
        const roster = await prisma.patient.findMany({ select: { id: true, firstName: true, lastName: true } })
        const byId = new Set(roster.map((p) => p.id))
        const byName = new Map<string, string[]>()
        // Roster rows with no name at all (5 exist) are skipped: their key is
        // the empty string, which is a subset of every name and would match
        // indiscriminately in the subset pass below.
        const tokenIndex: { id: string; tokens: Set<string> }[] = []
        for (const p of roster) {
          const k = nameKey(`${p.lastName} ${p.firstName}`)
          if (!k) continue
          if (!byName.has(k)) byName.set(k, [])
          byName.get(k)!.push(p.id)
          tokenIndex.push({ id: p.id, tokens: new Set(k.split(' ')) })
        }

        // Fallback for name variants: POS free-text often carries an extra
        // middle name ("JAYSON PHARELL RAGON CUA" vs "CUA, JAYSON PHARELL") or
        // omits one ("SANTIAGO AIA" vs "SANTIAGO, AIA JOHAN"). Accept only when
        // exactly ONE roster patient stands in a strict subset/superset relation
        // — more than one candidate means we cannot tell them apart, so it stays
        // unmatched rather than guessing.
        function subsetMatch(posName: string): string | null {
          const at = new Set(nameKey(posName).split(' ').filter(Boolean))
          if (at.size < 2) return null   // a lone token ("RAZON") is never enough
          const hits: string[] = []
          for (const cand of tokenIndex) {
            if (cand.tokens.size < 2) continue
            const posInCand  = [...at].every(t => cand.tokens.has(t)) && cand.tokens.size > at.size
            const candInPos  = [...cand.tokens].every(t => at.has(t)) && at.size > cand.tokens.size
            if (posInCand || candInPos) {
              hits.push(cand.id)
              if (hits.length > 1) return null
            }
          }
          return hits.length === 1 ? hits[0] : null
        }

        // Count each unresolved identity once, not once per department row.
        const resolvedIdentity = new Map<string, string | null>()

        for (const r of hist.rows) {
          if (!(DEPTS as readonly string[]).includes(r.dept)) continue
          const rawIdentity = r.patientId ?? `name:${r.patientName ?? ''}`

          let pid: string | null
          if (resolvedIdentity.has(rawIdentity)) {
            pid = resolvedIdentity.get(rawIdentity)!
          } else {
            pid = null
            if (r.patientId && byId.has(r.patientId)) {
              pid = r.patientId
              match.byId++
            } else if (r.patientName) {
              const hits = byName.get(nameKey(r.patientName))
              if (hits && hits.length === 1) { pid = hits[0]; match.byName++ }
              else if (hits && hits.length > 1) match.ambiguous++
              else {
                const sub = subsetMatch(r.patientName)
                if (sub) { pid = sub; match.byNameVariant++ }
                else match.unmatched++
              }
            } else {
              match.unmatched++
            }
            resolvedIdentity.set(rawIdentity, pid)
          }

          // Unresolved POS patients still receive treatment — keep them in the
          // department counts under their POS identity rather than discarding
          // real activity, which would reintroduce the undercount this fixes.
          const key = pid ?? rawIdentity
          if (!patientDepts.has(key)) patientDepts.set(key, new Set())
          patientDepts.get(key)!.add(r.dept)
        }
      }
    } catch {
      // Historical merge is additive; if the Accounting Hub is unreachable the
      // section still renders from Schedule data alone.
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
