/**
 * Age lock for session documentation.
 *
 * Notes on sessions older than NOTE_WINDOW_MONTHS are read-only by default.
 * The intent is not to stop clinicians working — it's to stop a note being
 * written or altered months after the session, when nobody can reasonably
 * recall it, without that being a deliberate, recorded act.
 *
 * Derived, not stored: the lock is computed from Schedule.date every time it
 * is read. That means it needs no cron and no backfill, it applies to notes
 * that already exist the moment it ships, and a note silently becomes locked
 * on the day it ages out rather than on the day a job happens to run.
 *
 * Re-opening is deliberate and persisted (Schedule.noteUnlockedAt /
 * noteUnlockedById) rather than a client-side toggle, so the server can
 * enforce the lock rather than merely suggest it.
 *
 * NOT the same thing as SessionNote.lockedAt, which is the permanent freeze
 * stamped when the author is endorsed or discharged off the patient. That one
 * is never re-openable — a note is signed by whoever delivered the session at
 * the time they delivered it. Callers must check both.
 */

/** How far back a session can be documented freely. */
export const NOTE_WINDOW_MONTHS = 3

export interface AgeLockInput {
  /** The session's own date — not the note's createdAt. */
  date: Date | string
  noteUnlockedAt?: Date | string | null
}

/** The cutoff: sessions on or after this date are still freely editable. */
export function noteWindowStart(now: Date = new Date()): Date {
  const d = new Date(now)
  d.setMonth(d.getMonth() - NOTE_WINDOW_MONTHS)
  return d
}

/** True when the session is old enough to fall outside the documentation window. */
export function isPastNoteWindow(date: Date | string, now: Date = new Date()): boolean {
  return new Date(date) < noteWindowStart(now)
}

/**
 * True when documentation for this session is currently locked — i.e. it is
 * past the window AND nobody has re-opened it.
 */
export function isNoteAgeLocked(schedule: AgeLockInput, now: Date = new Date()): boolean {
  if (schedule.noteUnlockedAt) return false
  return isPastNoteWindow(schedule.date, now)
}

/** Message shown to the clinician and returned by the API on a 403. */
export const NOTE_AGE_LOCK_MESSAGE =
  `This session is more than ${NOTE_WINDOW_MONTHS} months old, so its notes are read-only. ` +
  `You can re-enable editing on the session if you need to correct or complete it.`
