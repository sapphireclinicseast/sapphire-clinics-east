// Thin stub for student/enrollment endpoints. Mirrors client-portal/src/lib/api.ts
// shape so we can drop in real /api/public/students/* routes later without
// changing the page components.

import type { EnrollmentDraft, EnrollmentLevel } from './session'

export const API_BASE = '/api/booking-proxy'

export class InvalidTokenError extends Error {
  constructor(msg = 'Your session has expired. Please sign in again.') {
    super(msg)
    this.name = 'InvalidTokenError'
  }
}

// Re-exported from session.ts so there's a single source of truth for the
// level enum (otherwise it's easy to extend one and not the other).
export type { EnrollmentLevel } from './session'

export type LearnerProfile = Omit<EnrollmentDraft, 'documents' | 'waiverSignedAt'>

export async function lookupStudent(email: string, lastName: string): Promise<{
  studentId: string
  firstName: string
  token: string
  level: EnrollmentLevel
}> {
  if (!email || !lastName) {
    throw new Error('Please provide both email and last name.')
  }
  // Returning-student lookup will hit the backend once available. For now we
  // simulate "no record found" so the UI nudges them to register.
  throw new Error("We couldn't find a record yet. Please register as a new student.")
}

export async function submitLearnerProfile(token: string, payload: LearnerProfile): Promise<{
  studentId: string
  firstName: string
  token: string
  level: EnrollmentLevel
}> {
  void token
  // Wire to /api/public/students/register-full when backend lands.
  return {
    studentId: 'draft_' + Math.random().toString(36).slice(2, 10),
    firstName: payload.firstName ?? 'Student',
    token: 'local.' + Math.random().toString(36).slice(2, 18),
    level: payload.level,
  }
}

export interface StaffMember {
  id: string
  firstName: string
  lastName: string
  email: string
  jobTitle: string
  department: string
  branch: string
}

/**
 * Pulls the Staff Module list from marketing.sapphireclinicseast.org via the
 * same-origin booking-proxy. Used by the admin to seed teacher accounts —
 * "teachers" must already exist as Staff records upstream.
 */
export async function listStaff(opts: { branch?: string; department?: string } = {}): Promise<StaffMember[]> {
  const qs = new URLSearchParams()
  if (opts.branch) qs.set('branch', opts.branch)
  if (opts.department) qs.set('department', opts.department)
  const suffix = qs.toString() ? '?' + qs.toString() : ''
  const res = await fetch(`${API_BASE}/staff${suffix}`)
  if (!res.ok) throw new Error('Failed to load staff list (' + res.status + ')')
  const data = await res.json() as { staff: StaffMember[] }
  return data.staff
}

export interface Branch {
  id: string
  shortCode: string
  name: string
  brandName: string | null
  address: string | null
  phone: string | null
  emailMain: string | null
  departmentsOffered: string[]
  operatingDays: string[]
  operatingHoursOpen: string | null
  operatingHoursClose: string | null
}

/**
 * Pulls the Branches Registry from HR Platform via marketing's synced
 * cache, through the same-origin booking-proxy → GET /api/public/branches.
 * HR Platform is the source of truth; this is a read-only mirror.
 */
export async function listBranches(): Promise<Branch[]> {
  const res = await fetch(`${API_BASE}/branches`)
  if (!res.ok) throw new Error('Failed to load branches (' + res.status + ')')
  const data = await res.json() as { branches: Branch[] }
  return data.branches
}

export async function submitDocuments(token: string, payload: {
  documents: Record<string, { name: string; size: number }>
  waiverSignedAt?: string
}): Promise<{ ok: true }> {
  void token; void payload
  // Wire to /api/public/students/:id/documents when backend lands.
  return { ok: true }
}
