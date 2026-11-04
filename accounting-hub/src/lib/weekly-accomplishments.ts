/**
 * Weekly Accomplishment reports from the HR Platform, for Payroll.
 *
 * Only employees who are hybrid or WFH at a branch report (consultants don't).
 * A week of WFH can be counted or paid only once that week's report is submitted
 * AND approved in HR. HR holds the reports and the approvals; this module reads
 * them for a cutoff and works out who is clear. Nothing here changes pay.
 */

const HR_PLATFORM_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

export type WaWeekState = 'approved' | 'pending' | 'resubmit' | 'disapproved' | 'missed' | 'open' | 'upcoming'
export type WaClearance = 'cleared' | 'hold' | 'in-progress'

export interface WaWeek { week: string; state: WaWeekState; submittedAt: string | null }
export interface WaPerson {
  staffId: string
  name: string
  branches: string[]
  weeks: WaWeek[]
  clearance: WaClearance
}

const HR_BRANCH_TO_HUB: Record<string, string> = {
  'sandbox-east': 'SBEA',
  'sandbox-greenhills': 'SBGH',
  'verdana-store': 'VERDANA',
}

/** Weeks whose reports are overdue or were not accepted. */
const BLOCKING: WaWeekState[] = ['missed', 'pending', 'resubmit', 'disapproved']

/**
 * hold: something is overdue or not approved. in-progress: nothing is wrong yet,
 * but part of the cutoff hasn't been reported on. cleared: every week is approved.
 */
export function clearanceFor(weeks: WaWeek[]): WaClearance {
  if (weeks.some(w => BLOCKING.includes(w.state))) return 'hold'
  return weeks.every(w => w.state === 'approved') ? 'cleared' : 'in-progress'
}

export type WaFetch = { ok: true; people: WaPerson[] } | { ok: false; message: string }

export async function fetchWeeklyAccomplishments(from: string, to: string, branch?: string): Promise<WaFetch> {
  try {
    const res = await fetch(`${HR_PLATFORM_URL}/weekly-accomplishments/external?from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${EXTERNAL_API_KEY}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      console.error(`[weekly-accomplishments] HR Platform returned ${res.status}`)
      return { ok: false, message: `The HR Platform answered with an error (${res.status}).` }
    }
    const data = await res.json()
    const people: WaPerson[] = (data.people || [])
      .map((p: { staffId: string; name: string; branches?: string[]; weeks?: WaWeek[] }) => {
        const weeks = p.weeks || []
        return {
          staffId: p.staffId,
          name: p.name,
          branches: (p.branches || []).map(b => HR_BRANCH_TO_HUB[b] || b),
          weeks,
          clearance: clearanceFor(weeks),
        }
      })
      .filter((p: WaPerson) => !branch || p.branches.includes(branch))
    return { ok: true, people }
  } catch (e) {
    console.error('[weekly-accomplishments] HR fetch error:', e)
    return { ok: false, message: 'The HR Platform could not be reached.' }
  }
}
