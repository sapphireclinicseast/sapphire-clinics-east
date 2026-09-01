// Work Arrangement → Decking sections.
//
// HR stores one slug per consultant. The Decking board shows four sections and
// a consultant can legitimately appear in TWO of them: the combined values
// ("on-site + teletherapy") mean exactly that, so the mapping is one-to-many
// rather than a partition.
//
// Untagged is a real state, not missing data. Most of the roster has no
// arrangement set, and "hybrid"/"wfh" describe office attendance rather than
// service delivery, so none of them belong on a service board. They surface
// under All so nobody silently disappears from Decking.

export type DeckSection = 'onsite' | 'teletherapy' | 'homecare' | 'all' | 'perday' | 'sped'

export const DECK_SECTIONS: { key: DeckSection; label: string; blurb: string }[] = [
  { key: 'onsite',      label: 'On-site',     blurb: 'Consultants seeing patients in clinic' },
  { key: 'teletherapy', label: 'Teletherapy', blurb: 'Consultants running remote sessions' },
  { key: 'homecare',    label: 'Homecare',    blurb: 'Consultants travelling to patients' },
  { key: 'all',         label: 'All',         blurb: 'Every consultant, however they are tagged' },
  // Not a roster cut like the others — an aggregate of the same slots by day of
  // week, for setting a per-day session target. Last because it answers a
  // different question from the four boards before it.
  { key: 'perday',      label: 'Per Day',     blurb: 'Weekly totals by day, all departments — for setting a daily target' },
  // Not a roster cut either: SPED runs classes, so it gets one board for the
  // branch rather than a grid per consultant.
  { key: 'sped',        label: 'SPED Class',  blurb: 'One board for SPED classes — many children per block, blocks longer than an hour' },
]

// HR's slugs. Kept as a literal list so an unrecognised value from HR falls
// through to "untagged" instead of quietly matching nothing.
const ONSITE      = new Set(['on-site', 'on-site-teletherapy', 'on-site-homecare'])
const TELETHERAPY = new Set(['on-site-teletherapy', 'teletherapy'])
const HOMECARE    = new Set(['on-site-homecare', 'homecare'])

/**
 * Normalise whatever HR sends into the slug vocabulary above.
 *
 * HR is a separate service and may hand over either the slug ("on-site") or the
 * display label ("On-site + Teletherapy"). Both must land on the same section,
 * so fold case, punctuation and the common spelling variants before matching.
 * An unrecognised value survives normalisation unchanged and simply matches no
 * service section — it shows under All rather than being silently dropped.
 */
export function normalizeArrangement(raw: string | null | undefined): string | null {
  if (!raw) return null
  let a = raw.trim().toLowerCase()
  if (!a) return null
  a = a
    .replace(/\s*[+&]\s*|\s+and\s+/g, '-')  // "on-site + teletherapy" → "on-site-teletherapy"
    .replace(/[\s_/]+/g, '-')                // spaces, underscores, slashes → hyphen
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  // Spelling variants seen in HR copy, folded onto the canonical slugs.
  const alias: Record<string, string> = {
    'onsite': 'on-site',
    'in-clinic': 'on-site',
    'work-from-home': 'wfh',
    'home-based': 'wfh',
    'telehealth': 'teletherapy',
    'tele': 'teletherapy',
    'home-care': 'homecare',
    'onsite-teletherapy': 'on-site-teletherapy',
    'on-site-telehealth': 'on-site-teletherapy',
    'onsite-homecare': 'on-site-homecare',
    'on-site-home-care': 'on-site-homecare',
  }
  return alias[a] ?? a
}

/** Does this arrangement put a consultant on the given service section? */
export function inSection(arrangement: string | null | undefined, section: DeckSection): boolean {
  if (section === 'all') return true
  const a = normalizeArrangement(arrangement)
  if (!a) return false
  if (section === 'onsite')      return ONSITE.has(a)
  if (section === 'teletherapy') return TELETHERAPY.has(a)
  if (section === 'homecare')    return HOMECARE.has(a)
  // 'perday' and 'sped' are not roster cuts — one is an aggregate of slots, the
  // other a class board — so no consultant "belongs" to either. Spelled out
  // because the old trailing `return HOMECARE.has(a)` would have quietly
  // answered the homecare question for them.
  return false
}

/**
 * True when a consultant matches no service section — untagged, hybrid, wfh, or
 * a value HR added that this app does not know about yet. These appear only
 * under All.
 */
export function isUnsectioned(arrangement: string | null | undefined): boolean {
  return !inSection(arrangement, 'onsite')
      && !inSection(arrangement, 'teletherapy')
      && !inSection(arrangement, 'homecare')
}

/** Human label for the arrangement, for badges and tooltips. */
export function arrangementLabel(arrangement: string | null | undefined): string {
  const a = normalizeArrangement(arrangement)
  return ({
    'on-site': 'On-site',
    'hybrid': 'Hybrid',
    'wfh': 'WFH',
    'on-site-teletherapy': 'On-site + Teletherapy',
    'teletherapy': 'Teletherapy',
    'homecare': 'Homecare',
    'on-site-homecare': 'On-site + Homecare',
  } as Record<string, string>)[a ?? ''] ?? (a || 'Not set')
}

/**
 * The arrangement that applies to a consultant AT ONE BRANCH.
 *
 * HR keeps arrangement on the per-branch employment record and also on the
 * staff record. The two are not interchangeable: across the live roster 76 of
 * the 110 staff carrying both have DIFFERENT values, and 7 of the 10
 * multi-branch staff are tagged differently at each branch — an interbranch
 * consultant is genuinely on-site at one clinic and teletherapy at the other.
 * Decking is filtered by branch, so the per-branch value is authoritative and
 * the staff-level one is only a fallback (8 staff carry it alone).
 */
export function arrangementFor(
  s: { workArrangement?: string | null; branchEmployment?: unknown },
  branch: string,
): string | null {
  const be = s.branchEmployment as Record<string, { arrangement?: string | null } | null> | null | undefined
  const perBranch = be && typeof be === 'object' ? be[branch]?.arrangement : null
  return normalizeArrangement(perBranch ?? s.workArrangement)
}
