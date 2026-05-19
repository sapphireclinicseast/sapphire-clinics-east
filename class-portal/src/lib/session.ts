// Client-side enrollment draft, backed by localStorage. Persists the
// New Student → Enroll (full DepEd-style learner profile) → Documents flow
// across page navigations. Once a backend endpoint exists, wire the helpers
// in `api.ts` to it and continue to use this store for in-progress drafts.

const DRAFT_KEY = 'scei_class_draft_v1'
const SESSION_KEY = 'scei_class_session_v1'

export type EnrollmentLevel = 'KINDER' | 'GRADE_1' | 'GRADE_2' | 'GRADE_3'
export type LrnStatus = 'NO_LRN' | 'WITH_LRN' | 'RETURNING'
export type GuardianOfRecord = 'FATHER' | 'MOTHER' | 'OTHER'

export interface NameParts {
  lastName: string
  firstName: string
  middleName: string
}

export interface EnrollmentDraft {
  // Step 1 — picked on the home page
  level: EnrollmentLevel

  // Step 2 — DepEd-style learner profile (all uppercase on submit)
  schoolYearFrom?: string
  schoolYearTo?: string
  lrnStatus?: LrnStatus
  lrn?: string
  psaBirthCertNo?: string

  lastName?: string
  firstName?: string
  middleName?: string
  extensionName?: string

  dob?: string             // ISO date (YYYY-MM-DD)
  sex?: 'MALE' | 'FEMALE'

  ipMember?: 'YES' | 'NO'
  ipCommunity?: string

  motherTongue?: string
  religion?: string
  diagnosis?: string

  houseStreet?: string
  barangay?: string
  cityProvinceCountry?: string
  zipCode?: string

  father?: NameParts
  mother?: NameParts
  guardian?: NameParts
  guardianOfRecord?: GuardianOfRecord
  telephone?: string
  cellphone?: string
  email?: string

  isReturningOrTransferee?: 'YES' | 'NO'
  lastGradeCompleted?: string
  lastSchoolYearCompleted?: string
  previousSchoolName?: string
  previousSchoolId?: string
  previousSchoolAddress?: string

  // Parent/guardian signature on the certification block
  certSignatureDataUrl?: string
  certSignatureName?: string
  certSignedAt?: string

  // Step 3 — documents
  documents?: Record<string, { name: string; size: number }>
  waiverSignedAt?: string
}

export interface ClassSession {
  studentId: string
  firstName: string
  token: string
  level: EnrollmentLevel
}

export function getDraft(): Partial<EnrollmentDraft> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Partial<EnrollmentDraft>) : null
  } catch { return null }
}

export function setDraft(d: Partial<EnrollmentDraft>) {
  if (typeof window === 'undefined') return
  const prev = getDraft() ?? {}
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...prev, ...d }))
}

export function clearDraft() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(DRAFT_KEY)
}

export function getSession(): ClassSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as ClassSession) : null
  } catch { return null }
}

export function setSession(s: ClassSession) {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_KEY, JSON.stringify(s))
}

export function clearSession() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SESSION_KEY)
}

export function levelLabel(l: EnrollmentLevel): string {
  switch (l) {
    case 'KINDER': return 'Kindergarten'
    case 'GRADE_1': return 'Grade 1'
    case 'GRADE_2': return 'Grade 2'
    case 'GRADE_3': return 'Grade 3'
  }
}

/** Whole-year age based on a YYYY-MM-DD date string. Returns '' when invalid. */
export function ageFromDob(dob: string): string {
  if (!dob) return ''
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age >= 0 ? String(age) : ''
}
