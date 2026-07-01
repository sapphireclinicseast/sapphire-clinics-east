/**
 * Combined external staff list for Payroll / Staff Request sync.
 *
 * - Aura Health branches (SBEA / SBGH — "AHEA" / "AHGH") come from Operations
 *   (operations.sapphireclinicseast.org), which tracks therapy scheduling.
 * - Verdana staff come straight from the HR Platform (hr.sapphireclinicseast.org):
 *   they do not do therapy sessions, so Operations does not track them. HR is the
 *   authoritative source for Verdana, so they are pulled directly and thus included
 *   in salary processing (Payroll) and Staff Requests.
 *
 * The HR staff/external endpoint returns the same field shape as the Operations one
 * (firstName, lastName, department, jobTitle, employmentType, gov IDs, bank details)
 * except the record id is `hrId` (mapped to `id` here) and the branch is `VDNA`
 * (normalized to `VERDANA` here). Both endpoints authenticate with the shared
 * EXTERNAL_API_KEY Bearer token.
 */

const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'
const HR_PLATFORM_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExternalStaff = Record<string, any>

const isVerdanaBranch = (b: string) => ['VDNA', 'VERDANA'].includes((b || '').toUpperCase())

/**
 * All staff straight from the HR Platform (hr.sapphireclinicseast.org).
 * Used by the Employees sync — HR is the authoritative employee system of record
 * for every branch, so employees come from HR (not Operations). Maps HR's `hrId`
 * to `id` and normalizes the `VDNA` branch code to `VERDANA`.
 */
export async function fetchHrStaffForSync(): Promise<ExternalStaff[]> {
  try {
    const res = await fetch(`${HR_PLATFORM_URL}/staff/external`, {
      headers: { Authorization: `Bearer ${EXTERNAL_API_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error(`[external-staff] HR Platform returned ${res.status}`)
      return []
    }
    const data = await res.json()
    return (data.staff || []).map((s: ExternalStaff) => ({
      ...s,
      id: s.id || s.hrId,
      branch: isVerdanaBranch(s.branch) ? 'VERDANA' : s.branch,
    }))
  } catch (e) {
    console.error('[external-staff] HR staff fetch error:', e)
    return []
  }
}

export async function fetchExternalStaffForSync(): Promise<ExternalStaff[]> {
  let staff: ExternalStaff[] = []

  // Operations — every branch EXCEPT Verdana (Aura Health East/Greenhills).
  try {
    const res = await fetch(`${MARKETING_HUB_URL}/api/staff/external?includeHR=true`, {
      headers: { Authorization: `Bearer ${EXTERNAL_API_KEY}` },
      cache: 'no-store',
    })
    if (res.ok) {
      const data = await res.json()
      staff = (data.staff || []).filter((s: ExternalStaff) => !isVerdanaBranch(s.branch))
    } else {
      console.error(`[external-staff] Operations returned ${res.status}`)
    }
  } catch (e) {
    console.error('[external-staff] Operations fetch error:', e)
  }

  // HR Platform — Verdana only (retail staff, no therapy sessions).
  try {
    const res = await fetch(`${HR_PLATFORM_URL}/staff/external`, {
      headers: { Authorization: `Bearer ${EXTERNAL_API_KEY}` },
      cache: 'no-store',
    })
    if (res.ok) {
      const data = await res.json()
      const verdana = (data.staff || [])
        .filter((s: ExternalStaff) => isVerdanaBranch(s.branch))
        .map((s: ExternalStaff) => ({
          ...s,
          // Accounting sync keys externalStaffId off `id`; HR returns it as `hrId`.
          id: s.id || s.hrId,
          // Normalize HR's `VDNA` to the accounting branch code.
          branch: 'VERDANA',
        }))
      staff = staff.concat(verdana)
    } else {
      console.error(`[external-staff] HR Platform returned ${res.status}`)
    }
  } catch (e) {
    console.error('[external-staff] HR Verdana fetch error:', e)
  }

  return staff
}
