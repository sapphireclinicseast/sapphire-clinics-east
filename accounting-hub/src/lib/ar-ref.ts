// AR collection references — "AR25-0022", "AHEA-AR26-0015", "TC25-0011".
//
// The reference is keyed at the HEAD of an AR payment's notes (AR25-0022 | …,
// AHEA-AR26-0015; …), never in a field of its own. Only the head counts: a note
// further on may mention another payment's number ("moved to AR25-0016"), and
// reading that as this payment's reference showed the wrong number in Payment
// History (Hannah 2026-11-17).
//
// Series (what must run 0001, 0002, … with no gaps):
//   · AR<yy> with a branch prefix — AHEA-AR26, AHGH-AR26, VER-AR26 — one per branch.
//   · An unprefixed AR26+ number belongs to AHEA, where those payments were first
//     numbered (AR26-0001…0008, then AHEA-AR26-0009…). Unprefixed AR24 / AR25 are
//     the QuickBooks-era sequence, shared by GL and HMO.
//   · TC<yy> — the BIR 2307 withholding certificates booked as their own entries.

export const AR_REF_HEAD_RE = /^\s*((?:(?:AHEA|AHGH|VER)-)?(?:AR|TC)\d{2}-\d{3,5})\b/

/** The reference at the head of a payment's notes, or '' when it has none. */
export const arRefOf = (notes?: string | null): string => notes?.match(AR_REF_HEAD_RE)?.[1] || ''

/** The notes with the head reference (and the separator after it) taken off. */
export const notesWithoutRef = (notes?: string | null): string =>
  (notes || '').replace(new RegExp(`${AR_REF_HEAD_RE.source}\\s*[;|:–-]?\\s*`), '').trim()

/** Notes with `ref` written at the head, replacing any reference already there. */
export const notesWithRef = (ref: string, notes: string): string =>
  [ref.trim(), notesWithoutRef(notes)].filter(Boolean).join('; ')

export interface ParsedArRef {
  ref: string
  prefix: '' | 'AHEA' | 'AHGH' | 'VER'
  kind: 'AR' | 'TC'
  yy: number
  num: number
  /** The sequence the number belongs to, e.g. "AHEA-AR26", "AR25", "TC25". */
  series: string
}

export function parseArRef(ref: string): ParsedArRef | null {
  const m = ref.trim().match(/^(?:(AHEA|AHGH|VER)-)?(AR|TC)(\d{2})-(\d{3,5})$/)
  if (!m) return null
  const prefix = (m[1] || '') as ParsedArRef['prefix']
  const kind = m[2] as 'AR' | 'TC'
  const yy = parseInt(m[3], 10)
  const num = parseInt(m[4], 10)
  const series = prefix
    ? `${prefix}-${kind}${m[3]}`
    : kind === 'AR' && yy >= 26 ? `AHEA-AR${m[3]}` : `${kind}${m[3]}`
  return { ref: ref.trim(), prefix, kind, yy, num, series }
}

/** The way a number is written in its series, e.g. ("AHEA-AR26", 9) → "AHEA-AR26-0009". */
export const refInSeries = (series: string, num: number) => `${series}-${String(num).padStart(4, '0')}`

// "Physical copy pending" — an AR number given in the hub after the fact, before
// the paper copy (OR / acknowledgement filed under that number) was compiled
// (Hannah 2026-11-18: "make sure they are a different color because a physical
// copy of them have not been compiled yet"). Kept as a tag in the notes so it
// needs no column; the Payment Register colours these rows and clears the tag
// with "Mark compiled".
export const COPY_PENDING_TAG = '[PHYSICAL COPY PENDING]'
const COPY_PENDING_TEST = /\[PHYSICAL COPY PENDING\]/i
const COPY_PENDING_STRIP = /\s*(?:[|;]\s*)?\[PHYSICAL COPY PENDING\]/gi

export const hasCopyPending = (notes?: string | null): boolean => COPY_PENDING_TEST.test(notes || '')
export const withoutCopyPending = (notes?: string | null): string => (notes || '').replace(COPY_PENDING_STRIP, '').trim()
export const withCopyPending = (notes?: string | null): string => {
  const base = withoutCopyPending(notes)
  return base ? `${base} | ${COPY_PENDING_TAG}` : COPY_PENDING_TAG
}
