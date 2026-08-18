// Intern portal-access lifecycle: an intern's account is auto-disabled once
// their clinical rotation has lapsed by more than ROTATION_GRACE_DAYS.
const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'
const HR_KEY = process.env.HR_API_KEY ?? ''

export const ROTATION_GRACE_DAYS = 15

// The date on/after which access should be cut, given a rotation end.
export function accessCutoff(contractExpiry?: string | null): Date | null {
  if (!contractExpiry) return null
  const end = new Date(contractExpiry)
  if (isNaN(end.getTime())) return null
  return new Date(end.getTime() + ROTATION_GRACE_DAYS * 24 * 60 * 60 * 1000)
}

export function isRotationLapsed(contractExpiry?: string | null, now: number = Date.now()): boolean {
  const cutoff = accessCutoff(contractExpiry)
  return cutoff ? now > cutoff.getTime() : false
}

// hrPlatformId -> contractExpiry (the intern's rotation End month), from HR.
export async function fetchHrRotationMap(): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  if (!HR_KEY) return map
  try {
    const res = await fetch(`${HR_API_BASE}/staff/external`, {
      headers: { Authorization: 'Bearer ' + HR_KEY }, cache: 'no-store', signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json()
      for (const s of (data.staff ?? [])) map.set(s.hrId, s.contractExpiry ?? null)
    }
  } catch { /* HR unavailable */ }
  return map
}
