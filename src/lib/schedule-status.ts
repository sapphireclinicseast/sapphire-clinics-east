// Display names for ScheduleStatus.
//
// The enum values are SCREAMING_SNAKE, and every view was title-casing them
// inline with `st.charAt(0) + st.slice(1).toLowerCase()`. That works for
// single-word statuses and produces "No_show" for NO_SHOW, so the formatting
// lives here now and the views call it.
export function statusLabel(status: string): string {
  if (!status) return ''
  if (status === 'NO_SHOW') return 'No-Show'
  return status.charAt(0) + status.slice(1).toLowerCase()
}

// Statuses that mean the session did not happen as booked. These are the ones
// that carry fee consequences and belong in the Patient Relationship logs.
export const NON_ATTENDED_STATUSES = ['CANCELLED', 'RESCHEDULED', 'NO_SHOW'] as const
