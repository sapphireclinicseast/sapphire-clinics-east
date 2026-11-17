// Cancellation fees charged retroactively for past cancellations (Hannah,
// 2026-11-18): GL patients' cancelled / rescheduled / no-show bookings that were
// never charged were billed afterwards to the letter they were using, dated on
// the day of the cancellation. The order's notes start with this marker so the
// wallet ledger can show them in their own colour and front desk can tell them
// apart from charges rung on the day.

export const RETRO_CANCEL_MARKER = 'RETROACTIVE CANCELLATION FEE'

/** Font colour for retroactive charges in wallet views. */
export const RETRO_CANCEL_COLOR = '#7c3aed'

export const isRetroCancellation = (notes?: string | null): boolean =>
  !!notes && notes.trimStart().toUpperCase().startsWith(RETRO_CANCEL_MARKER)

/** Who may waive (forgive) a parked GL cancellation fee — not front desk. */
export const PARKED_FEE_WAIVE_ROLES = ['ADMIN', 'ACCOUNTANT', 'AHEA_ADMIN', 'AHGH_ADMIN']
