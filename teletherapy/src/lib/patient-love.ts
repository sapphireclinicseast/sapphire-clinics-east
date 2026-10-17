// Shared "What Patients Love About You" strengths extraction.
//
// A patient survey response only belongs on the kind-words wall (and should
// only raise an "appreciation" notification) when the patient actually wrote
// something in the free-text strengths question. Rating-only submissions leave
// that field blank. The wall (/api/patient-love) and the notifications feed
// (/api/notifications) MUST agree on this, or the bell count won't match the
// wall — so both import this single helper.

// Map of survey type → key(s) in responsesJson that hold the "strengths" text.
export const STRENGTHS_KEYS: Record<string, string[]> = {
  HR10: ['q9'],   // Pedia Patient
  HR11: ['q13'],  // Adult Patient
  HR12: ['q10'],  // Admin / Front Desk
  HR16: ['q11'],  // Group Therapy
}

// Fallback keys to search when the survey type isn't mapped above.
export const ALL_STRENGTHS_KEYS = ['q9', 'q10', 'q11', 'q13', 'strengths']

/**
 * Returns the trimmed free-text strengths answer for a survey response, or
 * null when the patient left it blank (e.g. a ratings-only submission). Newer
 * responses nest the numeric answers under a `ratings` array and keep the
 * free-text fields as top-level keys (often empty strings), so this only
 * treats a non-empty string of real length as a comment.
 */
export function extractStrength(surveyType: string, responsesJson: unknown): string | null {
  const json = (responsesJson ?? {}) as Record<string, unknown>
  const keys = STRENGTHS_KEYS[surveyType] ?? ALL_STRENGTHS_KEYS
  for (const key of keys) {
    const value = json[key]
    if (typeof value === 'string' && value.trim().length > 3) {
      return value.trim()
    }
  }
  return null
}
