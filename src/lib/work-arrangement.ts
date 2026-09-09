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

export type DeckSection = 'onsite' | 'teletherapy' | 'homecare' | 'all' | 'perday' | 'sped' | 'crosssell' | 'history'

/**
 * The board is two different jobs: filling the week, and reading it back.
 * Grouping them says so — 'decking' is where slots get booked, 'analysis' is
 * where the same slots are totalled, compared and charted. Order within each
 * group is the order they appear.
 */
export type DeckGroup = 'decking' | 'analysis'

export const DECK_GROUPS: { key: DeckGroup; label: string }[] = [
  { key: 'decking',  label: 'Decking' },
  { key: 'analysis', label: 'Analysis' },
]

export const DECK_SECTIONS: { key: DeckSection; label: string; blurb: string; group: DeckGroup }[] = [
  // ── Decking: where the week gets filled ──
  { key: 'onsite',      label: 'On-site',     blurb: 'Consultants seeing patients in clinic', group: 'decking' },
  { key: 'teletherapy', label: 'Teletherapy', blurb: 'Consultants running remote sessions', group: 'decking' },
  { key: 'homecare',    label: 'Homecare',    blurb: 'Consultants travelling to patients', group: 'decking' },
  // Not a roster cut like the three above: SPED runs classes, so it gets one
  // board for the branch rather than a grid per consultant. It sits with them
  // anyway because it is where SPED classes are actually booked.
  { key: 'sped',        label: 'SPED Class',  blurb: 'One board for SPED classes — many children per block, blocks longer than an hour', group: 'decking' },
  { key: 'all',         label: 'All',         blurb: 'Every consultant, however they are tagged', group: 'decking' },

  // ── Analysis: the same slots, read back ──
  { key: 'perday',      label: 'Per Day',     blurb: 'Weekly totals by day, all departments — for setting a daily target', group: 'analysis' },
  { key: 'crosssell',   label: 'Interdepartment', blurb: 'Patients seeing more than one department, and the ones who could be', group: 'analysis' },
  { key: 'history',     label: 'History',     blurb: 'Filled and open slots over time, per department', group: 'analysis' },
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
  // 'perday', 'sped', 'crosssell' and 'history' are not roster cuts — an
  // aggregate of slots, a class board, a patient list and a time series — so no
  // consultant "belongs" to any of them. Spelled out because the old trailing `return HOMECARE.has(a)`
  // would have quietly answered the homecare question for them.
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


/**
 * Does this consultant serve the section AT ANY BRANCH they work?
 *
 * `arrangementFor` asks about one branch, which is right for On-site and
 * Homecare — those are tied to a room and to a travel radius, so they belong to
 * the branch that runs them. Teletherapy is tied to neither: a consultant
 * running remote sessions can take either branch's patients, and in practice
 * does. Yap is tagged on-site+teletherapy at Greenhills and nothing at East, so
 * a per-branch question hid her from East's teletherapy board entirely.
 *
 * Checks the per-branch records first and the staff-level value as a fallback,
 * the same two sources `arrangementFor` reads.
 */
export function servesSectionAnywhere(
  s: { workArrangement?: string | null; branchEmployment?: unknown },
  section: DeckSection,
): boolean {
  if (inSection(s.workArrangement, section)) return true
  const be = s.branchEmployment as Record<string, { arrangement?: string | null } | null> | null | undefined
  if (!be || typeof be !== 'object') return false
  return Object.values(be).some(v => inSection(v?.arrangement, section))
}

/** Delivery mode stored on a slot. Null on a slot means unclassified. */
export type DeliveryMode = 'ONSITE' | 'TELETHERAPY' | 'HOMECARE'

export const DELIVERY_MODES: { key: DeliveryMode; label: string; section: DeckSection }[] = [
  { key: 'ONSITE',      label: 'On-site',     section: 'onsite' },
  { key: 'TELETHERAPY', label: 'Teletherapy', section: 'teletherapy' },
  { key: 'HOMECARE',    label: 'Homecare',    section: 'homecare' },
]

/**
 * The service sections a consultant's arrangement puts them in.
 *
 * More than one means the board cannot tell, from the consultant alone, which
 * kind of session a booking is — which is exactly when the slot has to say so
 * itself.
 */
export function sectionsFor(arrangement: string | null | undefined): DeckSection[] {
  return (['onsite', 'teletherapy', 'homecare'] as DeckSection[])
    .filter(sec => inSection(arrangement, sec))
}

/** True when a consultant serves more than one service section. */
export function isDualTagged(arrangement: string | null | undefined): boolean {
  return sectionsFor(arrangement).length > 1
}

/** The delivery mode implied by an arrangement that serves exactly one section. */
export function soleDeliveryMode(arrangement: string | null | undefined): DeliveryMode | null {
  const secs = sectionsFor(arrangement)
  if (secs.length !== 1) return null
  return DELIVERY_MODES.find(m => m.section === secs[0])?.key ?? null
}

/**
 * Does a slot belong on this section's board?
 *
 * A classified slot answers for itself. An UNCLASSIFIED slot falls back to the
 * consultant: single-section consultants have only one thing it could be, and a
 * dual-tagged consultant's unclassified slots appear under BOTH — the same
 * behaviour as before this column existed. Hiding them from one side would
 * silently remove real sessions from a board on the strength of a guess.
 */
export function slotInSection(
  slotMode: string | null | undefined,
  arrangement: string | null | undefined,
  section: DeckSection,
): boolean {
  if (slotMode) {
    return DELIVERY_MODES.find(m => m.key === slotMode)?.section === section
  }
  return inSection(arrangement, section)
}
