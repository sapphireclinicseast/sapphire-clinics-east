// "Not a duplicate" (Hannah 2026-11-11), for possible-duplicate HMO sessions
// (lib/hmo-duplicates). A button on the flagged Per HMO row asks for remarks and
// appends them to that order's remarks as a stamp. The stamp makes the two
// orders' remarks differ, so the pair stops matching, and it names the twins
// it was checked against. No Prisma here: the AR page imports these helpers.

export const NOT_DUP_PREFIX = 'Not a duplicate of'

/** Who may mark a session "Not a duplicate" — the Per HMO row editors (custom-date, soa-reassign). */
export const NOT_DUP_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']

/** The remarks segment saved by the "Not a duplicate" button. */
export function notDuplicateStamp(twins: number[], remarks: string, by: string, day: string): string {
  const clean = remarks.replace(/\|/g, '/').replace(/\s+/g, ' ').trim()
  return `${NOT_DUP_PREFIX} ${twins.map(n => `#${n}`).join(', ')} — ${clean} (${by}, ${day})`
}

/** Every "Not a duplicate" stamp in an order's remarks, newest last; null when none. */
export function notDuplicateNote(notes: string | null | undefined): string | null {
  if (!notes) return null
  const hits = notes.split(' | ').map(s => s.trim()).filter(s => s.toLowerCase().startsWith(NOT_DUP_PREFIX.toLowerCase()))
  return hits.length ? hits.join(' | ') : null
}

/** Order numbers a "Not a duplicate" note was checked against. */
export function notDuplicateTwins(note: string | null | undefined): number[] {
  if (!note) return []
  const out = new Set<number>()
  for (const seg of note.split(' | ')) {
    const head = seg.split(' — ')[0] || ''
    for (const m of head.matchAll(/#(\d+)/g)) out.add(Number(m[1]))
  }
  return Array.from(out)
}
