// Thin client for hitting the marketing app's /api/public/* routes.
// All requests go server-side via our own /api/booking-proxy to avoid browser
// CORS issues and hide MARKETING_URL from the client bundle.

export const API_BASE = '/api/booking-proxy'

export class InvalidTokenError extends Error {
  constructor(msg = 'Your session has expired. Please sign in again.') {
    super(msg)
    this.name = 'InvalidTokenError'
  }
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Treat any auth-scoped 401 as an expired/invalid session token.
    if (res.status === 401 || (typeof data?.error === 'string' && data.error.toLowerCase().includes('token'))) {
      if (typeof window !== 'undefined') {
        try { localStorage.removeItem('scei_patient_session_v1') } catch { /* ignore */ }
      }
      throw new InvalidTokenError()
    }
    throw new Error(data?.error ?? `HTTP ${res.status}`)
  }
  return data as T
}

export interface Therapist {
  id: string
  initials: string
  sex: 'M' | 'F' | null
  jobTitle: string | null
  /** false → staff has no DeckingTherapistConfig yet, so their week will be empty. */
  hasSchedule: boolean
}
export interface AvailableSlot {
  staffId: string
  initials: string
  sex: 'M' | 'F' | null
  date: string
  startTime: string
  endTime: string
  dayOfWeek: string
}
export type BookingStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'

export interface Booking {
  id: string
  status: BookingStatus
  branch: string
  department: string
  date: string
  startTime: string
  endTime: string
  isTeletherapy: boolean
  meetLink: string | null
  notes: string | null
  downpayment: number | null
  rejectionReason: string | null
  therapistInitials: string
  payment: { status: string; checkoutUrl: string | null; amount: number; paidAt: string | null } | null
}

export function listTherapists(branch: string, department: string) {
  const qs = new URLSearchParams({ branch, department }).toString()
  return jsonFetch<{ therapists: Therapist[] }>(`/therapists?${qs}`)
}

export function listAvailableSlots(
  branch: string,
  department: string,
  from: string,
  to: string,
  staffId?: string,
) {
  const qs = new URLSearchParams({ branch, department, from, to })
  if (staffId) qs.set('staffId', staffId)
  return jsonFetch<{ slots: AvailableSlot[] }>(`/available-slots?${qs.toString()}`)
}

export interface AuthResult {
  patientId: string
  firstName: string
  token: string
  reused?: boolean
}

export function lookupPatient(email: string, lastName: string) {
  return jsonFetch<AuthResult>(`/patients/lookup`, {
    method: 'POST',
    body: JSON.stringify({ email, lastName }),
  })
}

// Username (or legacy email) + password login for patients with a portal account.
export function loginPatient(username: string, password: string) {
  return jsonFetch<AuthResult>(`/patients/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

// Returning patient already in the CRM, claiming a portal account by setting a
// password (verified against their email + last name).
export function setPatientPassword(
  email: string,
  firstName: string,
  lastName: string,
  username: string,
  password: string,
) {
  return jsonFetch<AuthResult>(`/patients/set-password`, {
    method: 'POST',
    body: JSON.stringify({ email, firstName, lastName, username, password }),
  })
}

export function registerPatient(payload: {
  firstName: string
  lastName: string
  email: string
  password?: string
  phone?: string
  dob?: string
  sex?: string
  address?: string
  city?: string
  civilStatus?: string
  religion?: string
  nationality?: string
  diagnosis?: string
  pwdSeniorId?: string
  branch: 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS'
  patientType: 'PEDIATRIC' | 'ADULT'
  // Optional attachments, sent as base64 data URLs.
  referralFile?: { name?: string; dataUrl: string }
  pwdIdFile?: { name?: string; dataUrl: string }
}) {
  return jsonFetch<AuthResult>(`/patients/register`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface PatientProfile {
  fullName: string
  dob: string | null
  sex: string | null
  age: number | null
  patientType: string
  diagnosis: string | null
  city: string | null
  branch: string | null
  email: string | null
  phone: string | null
  address: string | null
  civilStatus: string | null
  pwdSeniorId: string | null
  username: string | null
  profilePhoto: string | null
  referralUrl?: string | null
  pwdIdUrl?: string | null
}
export interface PatientSessionRecord {
  id: string
  date: string
  startTime: string
  endTime: string
  clinician: string
  department: string
  status: string
  isTeletherapy: boolean
  source: 'schedule' | 'booking'
}
export interface ActiveSurvey {
  id: string
  surveyType: string
  expiresAt: string
}
export interface MeResult {
  profile: PatientProfile
  servicesAvailed: string[]
  sessions: PatientSessionRecord[]
  surveys: ActiveSurvey[]
}

export function getMe(token: string) {
  return jsonFetch<MeResult>(`/patients/me?token=${encodeURIComponent(token)}`)
}

// Update the signed-in patient's own account (photo / username / password).
export function updatePatientProfile(
  token: string,
  payload: {
    username?: string
    photo?: string | null
    currentPassword?: string
    newPassword?: string
  },
) {
  return jsonFetch<{ ok: boolean; username: string | null; profilePhoto: string | null }>(
    `/patients/update`,
    { method: 'POST', body: JSON.stringify({ token, ...payload }) },
  )
}

export interface SlotChoice {
  staffId: string
  date: string
  startTime: string
  endTime: string
}

export function createBooking(payload: {
  token: string
  branch: string
  department: string
  isTeletherapy: boolean
  notes?: string
  choices: SlotChoice[] // 1-3 choices
}) {
  // New flow: backend creates the booking AND generates a PayMongo Link in
  // one round-trip. Caller redirects to checkoutUrl to take payment.
  // When the booked service has a ₱0 downpayment, checkoutUrl is null and
  // the booking is auto-marked PAID.
  return jsonFetch<{
    booking: { id: string; status: BookingStatus }
    checkoutUrl: string | null
  }>(`/bookings`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function listMyBookings(token: string) {
  return jsonFetch<{ bookings: Booking[] }>(`/bookings?token=${encodeURIComponent(token)}`)
}

export function getPaymentUrl(bookingId: string, token: string) {
  return jsonFetch<{ checkoutUrl: string; amount: number; status: string }>(
    `/bookings/${encodeURIComponent(bookingId)}/pay?token=${encodeURIComponent(token)}`,
  )
}

export function cancelBooking(bookingId: string, token: string) {
  return jsonFetch<{ booking: { id: string; status: BookingStatus } }>(
    `/bookings/${encodeURIComponent(bookingId)}/cancel`,
    { method: 'POST', body: JSON.stringify({ token }) },
  )
}
