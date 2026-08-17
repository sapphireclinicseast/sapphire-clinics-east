// Shared loader for POS treatment history held in the Accounting Hub.
//
// This hub's Schedule table only starts when the Clinic Schedule module went
// into use (~Mar 2026); POS orders run from Jun 2024. Both the "Patients by
// Service" breakdown and the Interdepartmental Service Co-occurrence /
// Multi-Service Combinations analyses need the full history, so the fetch and
// the identity matching live here rather than being copied into each route —
// two copies of this matching logic would inevitably drift apart.

import { prisma } from '@/lib/prisma'

export interface PosHistory {
  /** patientKey → set of departments. Key is this hub's Patient.id when the
   *  identity could be resolved, otherwise an opaque POS identity so real
   *  treatment is still counted rather than discarded. */
  patientDepts: Map<string, Set<string>>
  /** "YYYY-MM" → dept → session count. Volume, not unique patients. */
  monthly: Map<string, Record<string, number>>
  window: { from: string | null; to: string | null }
  match: { byId: number; byName: number; byNameVariant: number; unmatched: number; ambiguous: number }
  skippedNonPatient: number
}

/** Order- and punctuation-insensitive token key. POS stores one free-text name
 *  whose word order is inconsistent ("ZAPATA ENRICO" vs "Enrico Zapata"), so a
 *  sorted token set matches ~93% of the name-only history where plain string
 *  equality matches almost none. */
export function nameKey(s: string): string {
  return s
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z ]/g, ' ')
    .split(/\s+/).filter(Boolean).sort().join(' ')
}

/**
 * Fetches POS history and resolves each POS identity onto this hub's patients.
 *
 * Three tiers, most to least certain:
 *   1. exact patientId  — 917 of 924 POS ids are this hub's Patient.id
 *   2. exact name token set
 *   3. unique subset/superset token match, for name variants (extra or missing
 *      middle name, initials, suffixes). Only when exactly ONE roster patient
 *      qualifies; more than one means they can't be told apart.
 *
 * Returns null when the Accounting Hub can't be reached or no key is
 * configured — callers must treat the merge as additive and still render from
 * their own data.
 */
export async function loadPosHistory(
  filterBranches: string[] | null,
  allowedDepts: readonly string[],
): Promise<PosHistory | null> {
  const acctUrl = process.env.ACCOUNTING_HUB_URL ?? 'https://accounting.sapphireclinicseast.org'
  const acctKey = process.env.EXTERNAL_API_KEY ?? ''
  if (!acctKey) return null

  let hist: {
    window: { from: string | null; to: string | null }
    rows: { patientId: string | null; patientName: string | null; dept: string }[]
    monthly?: { month: string; dept: string; sessions: number }[]
    skippedNonPatient?: number
  }
  try {
    const qs = filterBranches && filterBranches.length > 0 ? `?branches=${filterBranches.join(',')}` : ''
    const res = await fetch(`${acctUrl}/api/internal/dept-patient-history${qs}`, {
      headers: { Authorization: `Bearer ${acctKey}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    hist = await res.json()
  } catch {
    return null
  }

  const roster = await prisma.patient.findMany({ select: { id: true, firstName: true, lastName: true } })
  const byId = new Set(roster.map(p => p.id))
  const byName = new Map<string, string[]>()
  // Roster rows with no name at all (5 exist) are excluded: their key is the
  // empty string, a subset of every name, which would match indiscriminately.
  const tokenIndex: { id: string; tokens: Set<string> }[] = []
  for (const p of roster) {
    const k = nameKey(`${p.lastName} ${p.firstName}`)
    if (!k) continue
    if (!byName.has(k)) byName.set(k, [])
    byName.get(k)!.push(p.id)
    tokenIndex.push({ id: p.id, tokens: new Set(k.split(' ')) })
  }

  function subsetMatch(posName: string): string | null {
    const at = new Set(nameKey(posName).split(' ').filter(Boolean))
    if (at.size < 2) return null      // a lone token ("RAZON") is never enough
    const hits: string[] = []
    for (const cand of tokenIndex) {
      if (cand.tokens.size < 2) continue
      const posInCand = [...at].every(t => cand.tokens.has(t)) && cand.tokens.size > at.size
      const candInPos = [...cand.tokens].every(t => at.has(t)) && at.size > cand.tokens.size
      if (posInCand || candInPos) {
        hits.push(cand.id)
        if (hits.length > 1) return null
      }
    }
    return hits.length === 1 ? hits[0] : null
  }

  const match = { byId: 0, byName: 0, byNameVariant: 0, unmatched: 0, ambiguous: 0 }
  const resolved = new Map<string, string | null>()
  const patientDepts = new Map<string, Set<string>>()

  for (const r of hist.rows) {
    if (!allowedDepts.includes(r.dept)) continue
    const rawIdentity = r.patientId ?? `name:${r.patientName ?? ''}`

    let pid: string | null
    if (resolved.has(rawIdentity)) {
      pid = resolved.get(rawIdentity)!
    } else {
      pid = null
      if (r.patientId && byId.has(r.patientId)) {
        pid = r.patientId; match.byId++
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
      resolved.set(rawIdentity, pid)
    }

    // Unresolved POS patients still received treatment — keep them under their
    // billing identity rather than discarding real activity.
    const key = pid ?? rawIdentity
    if (!patientDepts.has(key)) patientDepts.set(key, new Set())
    patientDepts.get(key)!.add(r.dept)
  }

  const monthly = new Map<string, Record<string, number>>()
  for (const m of hist.monthly ?? []) {
    if (!allowedDepts.includes(m.dept)) continue
    if (!monthly.has(m.month)) monthly.set(m.month, {})
    monthly.get(m.month)![m.dept] = (monthly.get(m.month)![m.dept] ?? 0) + m.sessions
  }

  return {
    patientDepts,
    monthly,
    window: hist.window ?? { from: null, to: null },
    match,
    skippedNonPatient: hist.skippedNonPatient ?? 0,
  }
}
