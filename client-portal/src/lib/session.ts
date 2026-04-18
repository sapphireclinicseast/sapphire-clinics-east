// Client-side patient session helpers backed by localStorage.

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
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function clearSession() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(KEY)
}
