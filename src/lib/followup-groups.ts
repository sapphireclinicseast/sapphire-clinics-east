// Follow-up recipient groups — the patients the Patient Relationship
// "Follow Up" tab shows as overdue, resolved as an SMS audience.
//
// ⚠ The interval is measured from the patient's FIRST consult
// (Patient.firstDayOfConsult, or their earliest recorded session), not from
// their most recent visit. That is what the Follow Up tab does, and these
// groups exist to be the same people it lists — so they match it deliberately.
//
// It is worth knowing what that means before sending: a patient who has been in
// weekly PT for two years is "overdue" under this rule permanently, because
// their first consult is long past. If the intent is "has not been seen in N
// months", this needs to key off the LAST session instead, and both this and the
// Follow Up tab would have to change together.

/**
 * Department follow-up intervals, in days. This is the single definition —
 * the Patient Relationship "Follow Up" tab imports it from here, so the SMS
 * audience and the tab cannot drift apart into two different rules.
 */
export const DEPT_FOLLOWUP: Record<string, { days: number; label: string }> = {
  PSYCHOLOGY: { days: 90,  label: '3 months of no consult' },
  PT:         { days: 60,  label: 'Should consult with MD after 2 months' },
  OT:         { days: 180, label: 'Reconsult with Developmental Pediatrician after 6 months' },
  SLP:        { days: 180, label: 'Reconsult with Developmental Pediatrician after 6 months' },
  SPED:       { days: 180, label: 'Reconsult with Developmental Pediatrician after 6 months' },
}

/**
 * Grace band around the due date used by the Follow Up tab: within ±7 days a
 * patient reads as "due", past it as "overdue". The SMS groups deliberately do
 * NOT apply it — they take everyone past the interval, due and overdue alike.
 */
export const TOLERANCE_DAYS = 7

export interface FollowUpGroup {
  key: string
  label: string
  departments: string[]
  days: number
  rule: string
}

// Each group names the departments it covers and takes its interval and rule
// text from DEPT_FOLLOWUP, so editing an interval there moves the tab and the
// SMS audience together.
function group(key: string, label: string, departments: string[]): FollowUpGroup {
  const spec = DEPT_FOLLOWUP[departments[0]]
  if (!spec) throw new Error(`No follow-up interval defined for ${departments[0]}`)
  return { key, label, departments, days: spec.days, rule: spec.label }
}

export const FOLLOWUP_GROUPS: FollowUpGroup[] = [
  group('followup-pt',    'PT Follow-up (overdue)',    ['PT']),
  group('followup-psych', 'Psych Follow-up (overdue)', ['PSYCHOLOGY']),
  // One group across three departments because they share one rule and one
  // action: go back to the Developmental Pediatrician.
  group('followup-devped', 'DevPed Follow-up (overdue)', ['OT', 'SLP', 'SPED']),
]

export function followUpGroup(key: string): FollowUpGroup | undefined {
  return FOLLOWUP_GROUPS.find(g => g.key === key)
}
