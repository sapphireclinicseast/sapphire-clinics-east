// "Mark cancelled" on AR HMO sessions (Hannah 2026-11-15) — shared by the page,
// Session Adjustments and the undo route. Prisma-free so client code can import it.

/** Who may cancel a session from AR, and undo that. */
export const CANCEL_SESSION_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

/** The POS void reason AR's "Mark cancelled" sends; the Session Adjustments note becomes "Order voided: Cancelled in AR — …". */
export const AR_CANCEL_PREFIX = 'Cancelled in AR — '

/** True for a Session Adjustments void row made by AR's "Mark cancelled". */
export const isArCancelNote = (note: string | null | undefined) => /^Order voided: Cancelled in AR/.test(note || '')
