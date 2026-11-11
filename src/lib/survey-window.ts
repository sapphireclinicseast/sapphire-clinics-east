/**
 * How long a patient has to answer a satisfaction survey.
 *
 * This used to be the end of the day it was created (daily-targets) or a flat
 * 24 hours (the QR flow). The effect was the same either way: a survey handed
 * out at four in the afternoon died before the patient got home.
 *
 * Measured over 2026 that produced 359 completions against 1,120 expiries —
 * three dead for every one returned — and every single completion landed
 * inside the first window, because no one has ever been able to answer late.
 * It fell hardest on Psychology (4.5% returned, against 15–21% elsewhere),
 * whose patients are the least likely to fill a form in the car park, and on
 * Greenhills (roughly half East's rate across every department).
 *
 * Seven days is a compromise: long enough that an evening session can be
 * answered the following weekend, short enough that the patient still
 * remembers the session they are rating.
 *
 * One function, not a constant, so the two call sites cannot drift apart again
 * — and so a third one added later inherits the window rather than inventing
 * its own.
 */
export const SURVEY_WINDOW_DAYS = 7

/** When a survey created now should stop accepting answers. */
export function surveyExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + SURVEY_WINDOW_DAYS * 24 * 60 * 60 * 1000)
}
