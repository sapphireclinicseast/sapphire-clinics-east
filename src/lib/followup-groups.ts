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
//
// The same computation lives inline in
// src/app/api/patient-relationship/route.ts. It is duplicated rather than
// shared for now; if either changes, change both.

export interface FollowUpGroup {
  key: string
  label: string
  departments: string[]
  days: number
  rule: string
}

export const FOLLOWUP_GROUPS: FollowUpGroup[] = [
  {
    key: 'followup-pt',
    label: 'PT Follow-up (overdue)',
    departments: ['PT'],
    days: 60,
    rule: 'Should consult with MD after 2 months',
  },
  {
    key: 'followup-psych',
    label: 'Psych Follow-up (overdue)',
    departments: ['PSYCHOLOGY'],
    days: 90,
    rule: '3 months of no consult',
  },
  {
    key: 'followup-devped',
    label: 'DevPed Follow-up (overdue)',
    // One group across three departments because they share one rule and one
    // action: go back to the Developmental Pediatrician.
    departments: ['OT', 'SLP', 'SPED'],
    days: 180,
    rule: 'Reconsult with Developmental Pediatrician after 6 months',
  },
]

export function followUpGroup(key: string): FollowUpGroup | undefined {
  return FOLLOWUP_GROUPS.find(g => g.key === key)
}
