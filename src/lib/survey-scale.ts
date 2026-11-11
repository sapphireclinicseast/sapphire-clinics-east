/**
 * The scale patient satisfaction and peer evaluations are answered on.
 *
 * Five. Checked against every rating ever recorded: 3,097 items across HR10,
 * HR11 and HR12, and the values present are exactly 1, 2, 3, 4 and 5. There
 * has never been a 6.
 *
 * It is a named constant because both leaderboards normalised the average by
 * SIX, which quietly scaled every clinician's satisfaction component to
 * five-sixths of what it should have been — about 17% light — in a composite
 * score shown on the queue television. A literal in two files is how that
 * happened and how it survived; a constant means the next reader can see what
 * the number is meant to be.
 */
export const SURVEY_SCALE_MAX = 5

/** An average rating as a 0–1 fraction of the scale, for weighted scoring. */
export function ratingFraction(avgRating: number): number {
  if (!Number.isFinite(avgRating) || avgRating <= 0) return 0
  return Math.min(1, avgRating / SURVEY_SCALE_MAX)
}
