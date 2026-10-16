// Client-side patient session cache.
//
// The real credential is an HttpOnly cookie (scei_pt) set by the booking-proxy —
// it is not readable from JS and survives iOS Safari's eviction of localStorage.
// This localStorage entry is only a convenience cache of the non-sensitive UI
// identity (name) plus a best-effort copy of the token for multipart uploads;
// auth itself always goes through the cookie. `token` may be '' for a session
// recovered from the cookie alone.

const KEY = 'scei_patient_session_v1'

export interface PatientSession {
  patientId: string
  firstName: string
  token: string
}

export function getSession(): PatientSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as PatientSession
  } catch {
    return null
  }
}

export function setSession(s: PatientSession) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode / quota */ }
}

export function clearSession() {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  // Clear the durable HttpOnly cookie too; fire-and-forget.
  try { void fetch('/api/portal-logout', { method: 'POST', credentials: 'include' }) } catch { /* ignore */ }
}

// Recover a session from the HttpOnly cookie when localStorage is empty (e.g.
// iOS evicted it, or a fresh tab). Hits /me with no token; the proxy injects the
// cookie. Returns and caches the session, or null if the cookie is gone/expired.
export async function recoverSession(): Promise<PatientSession | null> {
  if (typeof window === 'undefined') return null
  try {
    const r = await fetch('/api/booking-proxy/patients/me', { credentials: 'include' })
    if (!r.ok) return null
    const d = await r.json().catch(() => null)
    if (!d || !d.patientId) return null
    const s: PatientSession = {
      patientId: String(d.patientId),
      firstName: typeof d.firstName === 'string' ? d.firstName : '',
      token: typeof d.token === 'string' ? d.token : '',
    }
    setSession(s)
    return s
  } catch {
    return null
  }
}
