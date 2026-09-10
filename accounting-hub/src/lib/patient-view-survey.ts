import type { PatientViewBranch } from '@/lib/patient-view'

/**
 * Today's survey invitations for a branch, proxied from the Operations Hub,
 * which owns the selection — two copies of "who was chosen today" would
 * eventually disagree, and the survey results are scored against the Hub's
 * list, not ours.
 *
 * Server-only: the call authenticates with EXTERNAL_API_KEY, which must never
 * reach the tablet. Both the public tablet feed and the till's close-checkout
 * action read from here, so an invitee is recognised identically in both.
 */

const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

interface DailyTarget {
  assignmentId?: string
  patientId?: string
  patientName?: string
  staffName?: string
  department?: string
  startTime?: string
  status?: string
  surveyUrl?: string
}

export interface SurveyInvitation {
  id: string
  patientId: string
  name: string
  clinician: string
  time: string
  surveyUrl: string
}

/** O'CONNOR and OCONNOR are one person; names are matched letters-only. */
export function normalizeSurveyName(v: unknown): string {
  return String(v ?? '').toUpperCase().replace(/[^A-Z]/g, '')
}

/**
 * Fetch today's still-unanswered invitations. Failures return an error string
 * instead of throwing — a tablet in a clinic should degrade to "not available
 * right now" rather than a blank screen when the other hub is slow or down.
 */
export async function fetchSurveyInvitations(
  branch: PatientViewBranch,
): Promise<{ invitations: SurveyInvitation[]; error: string | null }> {
  try {
    // daily-targets authenticates on ?token=, not an Authorization header: with
    // a header alone it falls through to session auth and 400s with "branch
    // could not be determined from your role". Server-to-server over HTTPS, so
    // the key is not exposed to the tablet.
    const url = `${MARKETING_HUB_URL}/api/customer-survey/daily-targets`
      + `?branch=${encodeURIComponent(branch.surveyCode)}`
      + `&token=${encodeURIComponent(EXTERNAL_API_KEY)}`
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { invitations: [], error: `Survey list unavailable (${res.status})` }
    const d = await res.json()
    const rows: DailyTarget[] = Array.isArray(d) ? d : (d.targets || [])
    const invitations = rows
      // Only those still awaiting a response — someone who has already
      // answered should not be invited a second time from the counter.
      .filter(t => t.surveyUrl && String(t.status || 'PENDING').toUpperCase() !== 'COMPLETED')
      .map(t => ({
        id: String(t.assignmentId || t.patientId || t.patientName || ''),
        patientId: String(t.patientId || ''),
        name: String(t.patientName || '').trim(),
        clinician: String(t.staffName || '').trim(),
        time: String(t.startTime || '').trim(),
        surveyUrl: String(t.surveyUrl),
      }))
      .filter(t => t.name && t.surveyUrl)
    return { invitations, error: null }
  } catch {
    return { invitations: [], error: 'Survey list unavailable right now' }
  }
}

/** The invitation matching this patient, CRM id first, normalised name as fallback. */
export function matchInvitation(
  invitations: SurveyInvitation[],
  patientId: unknown,
  patientName: unknown,
): SurveyInvitation | null {
  const pid = String(patientId ?? '')
  const pname = normalizeSurveyName(patientName)
  return (
    (pid && invitations.find(i => i.patientId && i.patientId === pid)) ||
    (pname && invitations.find(i => normalizeSurveyName(i.name) === pname)) ||
    null
  )
}
