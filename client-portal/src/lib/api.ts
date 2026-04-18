// Thin client for hitting the marketing app's /api/public/* routes.
// All requests go server-side via our own /api/booking-proxy to avoid browser
// CORS issues and hide MARKETING_URL from the client bundle.

export const API_BASE = '/api/booking-proxy'

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
  return data as T
}

export interface Therapist {
  id: string
  initials: string
  sex: 'M' | 'F' | null
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

export function listAvailableSlots(branch: string, department: string, from: string, to: string) {
  const qs = new URLSearchParams({ branch, department, from, to }).toString()
  return jsonFetch<{ slots: AvailableSlot[] }>(`/available-slots?${qs}`)
}

export function lookupPatient(email: string, lastName: string) {
  return jsonFetch<{ patientId: string; firstName: string; token: string }>(`/patients/lookup`, {
    method: 'POST',
    body: JSON.stringify({ email, lastName }),
  })
}

export function registerPatient(payload: {
  firstName: string
  lastName: string
  email: string
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
}) {
  return jsonFetch<{ patientId: string; firstName: string; token: string }>(`/patients/register`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
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
  return jsonFetch<{ booking: { id: string; status: BookingStatus } }>(`/bookings`, {
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
