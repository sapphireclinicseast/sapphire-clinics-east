// Client-side enrollment draft, backed by localStorage. Persists the
// New Student → Enroll (full DepEd-style learner profile) → Documents flow
// across page navigations. Once a backend endpoint exists, wire the helpers
// in `api.ts` to it and continue to use this store for in-progress drafts.

const DRAFT_KEY = 'scei_class_draft_v1'
const SESSION_KEY = 'scei_class_session_v1'

export type EnrollmentLevel = 'NURSERY' | 'KINDER' | 'GRADE_1' | 'GRADE_2' | 'GRADE_3' | 'GRADE_4' | 'GRADE_5' | 'GRADE_6' | 'GRADE_7' | 'GRADE_8' | 'GRADE_9' | 'GRADE_10' | 'GRADE_11' | 'GRADE_12'
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
  /** Clinic branch picked on the home page before the level tile. */
  branch?: 'EAST' | 'GREENHILLS'

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
  nationality?: string
  diagnosis?: string
  /** PWD ID number — optional, for discount eligibility. */
  pwdIdNumber?: string
  /** LSEN classification per DepEd Learners Information System.
   *  Group A = formal diagnosis from a licensed medical specialist.
   *  Group B = manifestations of disability per ICF (no formal diagnosis). */
  lsenClassification?: LsenClassification

  houseStreet?: string
  barangay?: string
  cityProvinceCountry?: string
  zipCode?: string

  father?: NameParts
  fatherOccupation?: string
  mother?: NameParts
  motherOccupation?: string
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

  // Step 3 — documents (fileId points to the IndexedDB blob store)
  documents?: Record<string, { name: string; size: number; type?: string; fileId?: string }>
  waiverSignedAt?: string

  // Admission-tracking columns — edited by front desk + the partner school
  // via /admission. Stored in the enrollment blob so no schema migration.
  lisStatus?: LisStatus
  remittanceStatus?: RemittanceStatus
  /** Free-text notes from the front desk or partner school. Shown as the
   *  last column on the enrollment register; not displayed elsewhere. */
  admissionComments?: string
}

export type LisStatus = 'WAITING_FOR_ENROLLMENT' | 'PENDING_ENROLLMENT' | 'PENDING_TRANSFER' | 'ENROLLED'
export type RemittanceStatus = 'PENDING' | 'PAID'

/**
 * LSEN classification per the DepEd Learners Information System (LIS).
 * Group A — formal diagnosis from a licensed medical specialist.
 * Group B — no diagnosis on file but manifestations of disability per the
 *           International Classification of Functioning (ICF).
 */
export type LsenClassification =
  | 'A_VISUAL_IMPAIRMENT'
  | 'A_HEARING_IMPAIRMENT'
  | 'A_LEARNING_DISABILITY'
  | 'A_INTELLECTUAL_DISABILITY'
  | 'A_AUTISM_SPECTRUM_DISORDER'
  | 'A_EMOTIONAL_BEHAVIORAL_DISORDER'
  | 'A_ORTHOPEDIC_PHYSICAL_HANDICAP'
  | 'A_SPEECH_LANGUAGE_DISORDER'
  | 'A_CEREBRAL_PALSY'
  | 'A_SPECIAL_HEALTH_CHRONIC_DISEASE'
  | 'A_MULTIPLE_DISABILITIES'
  | 'B_DIFFICULTY_SEEING'
  | 'B_DIFFICULTY_HEARING'
  | 'B_DIFFICULTY_BASIC_LEARNING'
  | 'B_DIFFICULTY_REMEMBERING_CONCENTRATING'
  | 'B_DIFFICULTY_APPLYING_ADAPTIVE_SKILLS'
  | 'B_DIFFICULTY_INTERPERSONAL_BEHAVIOR'
  | 'B_DIFFICULTY_MOBILITY'
  | 'B_DIFFICULTY_COMMUNICATING'

export const LSEN_CLASSIFICATION_GROUPS: Array<{
  group: string
  options: Array<{ value: LsenClassification; label: string }>
}> = [
  {
    group: 'A. With diagnosis from a licensed medical specialist',
    options: [
      { value: 'A_VISUAL_IMPAIRMENT',              label: 'A. Visual Impairment' },
      { value: 'A_HEARING_IMPAIRMENT',             label: 'B. Hearing Impairment' },
      { value: 'A_LEARNING_DISABILITY',            label: 'C. Learning Disability' },
      { value: 'A_INTELLECTUAL_DISABILITY',        label: 'D. Intellectual Disability' },
      { value: 'A_AUTISM_SPECTRUM_DISORDER',       label: 'E. Autism Spectrum Disorder' },
      { value: 'A_EMOTIONAL_BEHAVIORAL_DISORDER',  label: 'F. Emotional-Behavioral Disorder' },
      { value: 'A_ORTHOPEDIC_PHYSICAL_HANDICAP',   label: 'G. Orthopedic / Physical Handicap' },
      { value: 'A_SPEECH_LANGUAGE_DISORDER',       label: 'H. Speech / Language Disorder' },
      { value: 'A_CEREBRAL_PALSY',                 label: 'I. Cerebral Palsy' },
      { value: 'A_SPECIAL_HEALTH_CHRONIC_DISEASE', label: 'J. Special Health Problem / Chronic Disease' },
      { value: 'A_MULTIPLE_DISABILITIES',          label: 'K. Multiple Disabilities' },
    ],
  },
  {
    group: 'B. No medical diagnosis, with manifestations (ICF)',
    options: [
      { value: 'B_DIFFICULTY_SEEING',                   label: '1. Difficulty in Seeing' },
      { value: 'B_DIFFICULTY_HEARING',                  label: '2. Difficulty in Hearing' },
      { value: 'B_DIFFICULTY_BASIC_LEARNING',           label: '3. Difficulty in Basic Learning and Applying Knowledge' },
      { value: 'B_DIFFICULTY_REMEMBERING_CONCENTRATING', label: '4. Difficulty in Remembering, Concentrating, Paying Attention and Understanding' },
      { value: 'B_DIFFICULTY_APPLYING_ADAPTIVE_SKILLS', label: '5. Difficulty in Applying Adaptive Skills' },
      { value: 'B_DIFFICULTY_INTERPERSONAL_BEHAVIOR',   label: '6. Difficulty in Displaying Interpersonal Behavior' },
      { value: 'B_DIFFICULTY_MOBILITY',                 label: '7. Difficulty in Mobility (Walking, Climbing and Grasping)' },
      { value: 'B_DIFFICULTY_COMMUNICATING',            label: '8. Difficulty in Communicating' },
    ],
  },
]

export function lsenClassificationLabel(value: LsenClassification | null | undefined): string {
  if (!value) return ''
  for (const g of LSEN_CLASSIFICATION_GROUPS) {
    const hit = g.options.find(o => o.value === value)
    if (hit) return hit.label
  }
  return value
}

export const LIS_STATUS_OPTIONS: Array<{ value: LisStatus; label: string }> = [
  { value: 'WAITING_FOR_ENROLLMENT', label: 'WAITING FOR ENROLLMENT' },
  { value: 'PENDING_ENROLLMENT',     label: 'PENDING ENROLLMENT' },
  { value: 'PENDING_TRANSFER',       label: 'PENDING TRANSFER' },
  { value: 'ENROLLED',               label: 'ENROLLED' },
]

export const REMITTANCE_OPTIONS: Array<{ value: RemittanceStatus; label: string }> = [
  { value: 'PENDING', label: 'PENDING' },
  { value: 'PAID',    label: 'PAID' },
]

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
    case 'NURSERY':  return 'Nursery'
    case 'KINDER':   return 'Kindergarten'
    case 'GRADE_1':  return 'Grade 1'
    case 'GRADE_2':  return 'Grade 2'
    case 'GRADE_3':  return 'Grade 3'
    case 'GRADE_4':  return 'Grade 4'
    case 'GRADE_5':  return 'Grade 5'
    case 'GRADE_6':  return 'Grade 6'
    case 'GRADE_7':  return 'Grade 7'
    case 'GRADE_8':  return 'Grade 8'
    case 'GRADE_9':  return 'Grade 9'
    case 'GRADE_10': return 'Grade 10'
    case 'GRADE_11': return 'Grade 11'
    case 'GRADE_12': return 'Grade 12'
  }
}

/** Human-readable label for an LrnStatus enum value. */
export function lrnStatusLabel(s: LrnStatus | undefined): string {
  switch (s) {
    case 'NO_LRN':    return 'No LRN'
    case 'WITH_LRN':  return 'With LRN'
    case 'RETURNING': return 'Returning (Balik-Aral)'
    default:          return '—'
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

/* ─────────────────────────────────────────────────────────────────
   Users + auth — backed by marketing.sapphireclinicseast.org API
   (Postgres). LocalStorage is a write-through cache for sync UI code.
   Sign-in mints a JWT (stored via backend.setToken). On app mount,
   hydrateUsers() pulls the latest list from the API and updates the
   cache so all existing sync helpers stay correct.
   ───────────────────────────────────────────────────────────── */

import { backendJson, setToken, clearToken, getToken, backendOrigin } from './backend'

const USERS_KEY = 'scei_class_users_v1'
const AUTH_KEY = 'scei_class_auth_v1'

export type UserRole = 'STUDENT' | 'TEACHER' | 'FRONTDESK' | 'BRANCH_ADMIN'
export type AuthRole = UserRole | 'ADMIN'

/** Clinic branch a record is scoped to. */
export type Branch = 'EAST' | 'GREENHILLS'

export function branchLabel(b: Branch | undefined | null): string {
  if (b === 'EAST') return 'East Branch'
  if (b === 'GREENHILLS') return 'Greenhills Branch'
  return '—'
}

export function roleLabel(r: UserRole | 'ADMIN'): string {
  switch (r) {
    case 'ADMIN':        return 'Main admin'
    case 'BRANCH_ADMIN': return 'Branch admin'
    case 'FRONTDESK':    return 'Front desk'
    case 'TEACHER':      return 'Teacher'
    case 'STUDENT':      return 'Student'
  }
}

export interface StoredUser {
  id: string
  role: UserRole
  email: string
  password: string
  firstName?: string
  lastName?: string
  level?: EnrollmentLevel
  branch?: Branch
  createdAt: string
  /** Snapshot of the enrollment draft at signup (students only). */
  enrollment?: Partial<EnrollmentDraft>
  /** Audit trail for password changes — server-side only, plaintext is
   *  NEVER stored. Used by the admin user list to show "Last reset by X
   *  on YYYY-MM-DD" instead of the unhelpful "not on device" placeholder. */
  passwordSetAt?: string | null
  passwordSetBy?: string | null
  /** Soft-disable timestamp. Non-null = account locked out. Hidden from
   *  teacher / front-desk / branch-admin views; main admin still sees
   *  the row so they can re-enable it. */
  disabledAt?: string | null
  /** Email of the admin who disabled the account. Cleared on re-enable. */
  disabledBy?: string | null
}

export interface AuthSession {
  role: AuthRole
  email: string
  userId?: string
  firstName?: string
  /** Branch the staff account is scoped to (FRONTDESK + BRANCH_ADMIN). */
  branch?: Branch
}

export const ADMIN_EMAIL = 'main@sapphireclinicseast.org'
export const ADMIN_PASSWORD = 'SCEI'

export function getUsers(): StoredUser[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(USERS_KEY)
    return raw ? (JSON.parse(raw) as StoredUser[]) : []
  } catch { return [] }
}

function writeUsers(users: StoredUser[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

export function findUser(role: UserRole, email: string): StoredUser | undefined {
  const e = email.trim().toLowerCase()
  return getUsers().find(u => u.role === role && u.email.toLowerCase() === e)
}

interface ApiUser {
  id: string
  role: UserRole
  email: string
  firstName?: string | null
  lastName?: string | null
  level?: EnrollmentLevel | null
  branch?: Branch | null
  enrollment?: Partial<EnrollmentDraft> | null
  passwordSetAt?: string | null
  passwordSetBy?: string | null
  disabledAt?: string | null
  disabledBy?: string | null
  createdAt: string
  updatedAt: string
}

function apiToStored(u: ApiUser, password = ''): StoredUser {
  return {
    id: u.id,
    role: u.role,
    email: u.email,
    password, // never sent back from API; password resets go through PATCH
    firstName: u.firstName ?? undefined,
    lastName: u.lastName ?? undefined,
    level: (u.level ?? undefined) as EnrollmentLevel | undefined,
    branch: (u.branch ?? undefined) as Branch | undefined,
    enrollment: u.enrollment ?? undefined,
    passwordSetAt: u.passwordSetAt ?? null,
    passwordSetBy: u.passwordSetBy ?? null,
    disabledAt: u.disabledAt ?? null,
    disabledBy: u.disabledBy ?? null,
    createdAt: u.createdAt,
  }
}

/** Pull the canonical user list from the API into the local cache. */
export async function hydrateUsers(): Promise<StoredUser[]> {
  if (typeof window === 'undefined') return []
  if (!getToken()) return getUsers()
  try {
    const { users } = await backendJson<{ users: ApiUser[] }>('/api/public/class-portal/users')
    const existing = getUsers()
    const localPws = readLocalPwMap()
    const merged: StoredUser[] = users.map(u => {
      const prev = existing.find(e => e.id === u.id)
      return apiToStored(u, prev?.password ?? localPws[u.id] ?? '')
    })
    writeUsers(merged)
    return merged
  } catch {
    return getUsers()
  }
}

export async function addUser(u: Omit<StoredUser, 'id' | 'createdAt'>): Promise<StoredUser> {
  const { user } = await backendJson<{ user: ApiUser }>('/api/public/class-portal/users', {
    method: 'POST',
    body: JSON.stringify({
      role: u.role,
      email: u.email.trim().toLowerCase(),
      password: u.password,
      firstName: u.firstName,
      lastName: u.lastName,
      level: u.level,
      branch: u.branch,
      enrollment: u.enrollment,
    }),
  })
  const stored = apiToStored(user, u.password)
  writeUsers([...getUsers().filter(x => x.id !== stored.id), stored])
  if (u.password) {
    try { setLocalPassword(stored.id, u.password) } catch { /* ignore */ }
  }
  return stored
}

export async function updateUser(id: string, patch: Partial<Omit<StoredUser, 'id' | 'createdAt' | 'role'>>): Promise<StoredUser> {
  const { user } = await backendJson<{ user: ApiUser }>(`/api/public/class-portal/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      email: patch.email,
      password: patch.password,
      firstName: patch.firstName,
      lastName: patch.lastName,
      level: patch.level,
      branch: patch.branch,
      enrollment: patch.enrollment,
    }),
  })
  const prev = getUsers().find(u => u.id === id)
  const stored = apiToStored(user, patch.password ?? prev?.password ?? '')
  writeUsers(getUsers().map(u => (u.id === id ? stored : u)))
  if (patch.password) {
    try { setLocalPassword(id, patch.password) } catch { /* ignore */ }
  }
  return stored
}

export async function deleteUser(id: string): Promise<void> {
  await backendJson(`/api/public/class-portal/users/${id}`, { method: 'DELETE' })
  writeUsers(getUsers().filter(u => u.id !== id))
  try { deleteLocalPassword(id) } catch { /* ignore */ }
}

/**
 * Soft-disable or re-enable a user. Disabled accounts can't sign in and
 * are hidden from teacher / front-desk / branch-admin listings; the
 * main admin still sees them so they can re-enable. Server enforces
 * role === 'ADMIN' on the PATCH.
 *
 * On success, mirrors the updated row into the local users cache so
 * the admin list re-renders with the new badge/state immediately.
 */
export async function setUserDisabled(id: string, disabled: boolean): Promise<StoredUser> {
  const { user } = await backendJson<{ user: ApiUser }>(`/api/public/class-portal/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ disabled }),
  })
  const prev = getUsers().find(u => u.id === id)
  const stored = apiToStored(user, prev?.password ?? '')
  writeUsers(getUsers().map(u => (u.id === id ? stored : u)))
  return stored
}

/**
 * Mint an impersonation session for the given user. Saves the resulting
 * token to per-tab sessionStorage so subsequent backendJson() calls go
 * through as the target user; the admin's own session is preserved in
 * localStorage. Closing the tab ends the impersonation automatically.
 */
export async function startImpersonation(userId: string, reason?: string): Promise<{ targetEmail: string }> {
  const { token, logId, user } = await backendJson<{
    token: string
    logId: string
    user: { id: string; role: string; email: string; firstName: string | null; lastName: string | null; branch: string | null }
  }>('/api/public/class-portal/impersonate', {
    method: 'POST',
    body: JSON.stringify({ userId, reason }),
  })
  const { setImpersonationToken } = await import('./backend')
  setImpersonationToken(token, {
    logId,
    targetEmail: user.email,
    targetRole: user.role,
    targetFirstName: user.firstName,
    targetLastName: user.lastName,
    startedAt: new Date().toISOString(),
  })
  return { targetEmail: user.email }
}

/**
 * Close the active impersonation session — clears the per-tab token and
 * stamps endedAt on the server-side audit row.
 */
export async function endImpersonation(): Promise<void> {
  const { clearImpersonationToken, getImpersonationMeta } = await import('./backend')
  const meta = getImpersonationMeta()
  try {
    await backendJson('/api/public/class-portal/impersonate', {
      method: 'PATCH',
      body: JSON.stringify({ logId: meta?.logId }),
    })
  } catch { /* best-effort — the local clear below still ends the session */ }
  clearImpersonationToken()
}

/**
 * Ask the marketing-hub to mint a one-shot password-reset link and email
 * it to the user. Plaintext passwords never pass through this flow — the
 * recipient sets their own new password via /reset?token=…
 *
 * Returns:
 *   { emailed: true }                         — sent successfully
 *   { emailed: false, manualLink: 'https…' }  — Resend down; admin shares link manually
 */
export async function sendPasswordResetLink(userId: string): Promise<{ emailed: boolean; manualLink?: string; warning?: string }> {
  const j = await backendJson<{ ok: boolean; emailed: boolean; manualLink?: string; warning?: string }>(
    '/api/public/class-portal/password-reset',
    { method: 'POST', body: JSON.stringify({ userId }) },
  )
  return { emailed: j.emailed, manualLink: j.manualLink, warning: j.warning }
}

/**
 * Patch a student's enrollment. Admin can call for any student; students
 * can only call for their own record (enforced server-side).
 */
export async function updateUserEnrollment(id: string, patch: Partial<EnrollmentDraft>): Promise<StoredUser> {
  const users = getUsers()
  const u = users.find(x => x.id === id)
  if (!u) throw new Error('User not found.')
  if (u.role !== 'STUDENT') throw new Error('Only student accounts have enrollment data.')
  const mergedEnrollment = { ...(u.enrollment ?? {}), ...patch }
  // Identity fields (firstName/lastName/email/level) exist at both the user
  // and enrollment levels — propagate any corrections to the top-level user
  // record so lists, identity card, payment/notification lookups stay in sync.
  const apiPatch = {
    firstName: patch.firstName ?? u.firstName,
    lastName: patch.lastName ?? u.lastName,
    email: patch.email ?? u.email,
    level: patch.level ?? u.level,
    branch: patch.branch ?? u.branch,
    enrollment: mergedEnrollment,
  }
  const { user } = await backendJson<{ user: ApiUser }>(`/api/public/class-portal/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(apiPatch),
  })
  const stored = apiToStored(user, u.password)
  writeUsers(getUsers().map(x => (x.id === id ? stored : x)))
  return stored
}

export function getAuth(): AuthSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    return raw ? (JSON.parse(raw) as AuthSession) : null
  } catch { return null }
}

export function setAuth(a: AuthSession) {
  if (typeof window === 'undefined') return
  localStorage.setItem(AUTH_KEY, JSON.stringify(a))
}

export function clearAuth() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(AUTH_KEY)
}

/* ─────────────────────────────────────────────────────────────────
   Waiver records — full Parent/Guardian Waiver content
   Stored once the parent signs. Teacher (witness) updates the same
   record on sign-in. Backend integration: replace with
   /api/public/students/:id/waiver later.
   ───────────────────────────────────────────────────────────── */

const WAIVERS_KEY = 'scei_class_waivers_v1'

export interface WaiverPersonName {
  printedName: string
  signatureDataUrl: string
  signedAt: string
}

export interface WaiverContent {
  // Student
  studentFullName: string
  studentDob: string
  studentAge: string
  studentGender: string
  gradeLevel: string
  termOfEnrollment: string
  studentNationality: string
  studentReligion: string
  homeAddress: string
  cityProvince: string
  previousSchool?: string
  schoolYearAttended?: string
  diagnosis?: string
  dateOfDiagnosis?: string

  // Primary parent/guardian
  primary: {
    fullName: string
    relationship: string
    mobile: string
    altNumber?: string
    email: string
    occupation?: string
    homeAddress: string
    officeAddress?: string
    govtId?: string
    idNumber?: string
  }

  // Secondary parent/guardian
  secondary?: {
    fullName: string
    relationship: string
    mobile: string
    email: string
  }

  // Authorized fetchers (up to 3)
  fetchers: Array<{
    name: string
    relationship: string
    mobile: string
    idNumber: string
  }>

  // Emergency contact + medical
  emergencyName: string
  emergencyRelationship: string
  emergencyMobile: string
  emergencyAlt?: string
  hospital: string
  hospitalContact?: string
  physician?: string
  physicianContact?: string
  allergies?: string
  bloodType?: string
  medications?: string
  dosageSchedule?: string
  medicalConditions?: string
  treatingSpecialist?: string
  behavioralTriggers?: string
  copingStrategies?: string
  dietaryRestrictions?: string
  mobilityNeeds?: string

  // 13 clauses (initials per clause)
  initials: Record<string, string>

  // Photo release: GRANT / DENY / null (treated as deny)
  photoRelease: 'GRANT' | 'DENY' | null

  // Date executed
  executionDay: string   // "DD"
  executionMonth: string // "Month"
  executionYear: string  // "YY" (20YY)
}

export interface WaiverRecord {
  id: string
  studentEmail: string
  studentFirstName: string
  studentLastName: string
  level: EnrollmentLevel
  content: WaiverContent
  parentSig: WaiverPersonName
  secondaryParentSig?: WaiverPersonName
  witnessSig?: WaiverPersonName & { teacherId?: string; teacherEmail?: string }
  /** "Sapphire Clinics East, Inc. — Acknowledged & Received" signature.
   *  Signed by EITHER the main admin OR a branch admin (one signature is
   *  enough). Captured by the admin/branch-admin from the student detail
   *  drawer after the parent has signed. */
  sceiAckSig?: WaiverPersonName & { signerEmail?: string; signerRole?: 'ADMIN' | 'BRANCH_ADMIN' }
  createdAt: string
  updatedAt: string
}

export function getWaivers(): WaiverRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(WAIVERS_KEY)
    return raw ? (JSON.parse(raw) as WaiverRecord[]) : []
  } catch { return [] }
}

function writeWaivers(records: WaiverRecord[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(WAIVERS_KEY, JSON.stringify(records))
}

export function saveWaiver(record: WaiverRecord) {
  const all = getWaivers()
  const idx = all.findIndex(w => w.id === record.id)
  if (idx >= 0) all[idx] = record
  else all.push(record)
  writeWaivers(all)
  // Best-effort server persistence so admins / teachers on other
  // devices see the latest signed state. Without this push, the
  // record only lives in the signing device's localStorage and the
  // student-detail card shows "Not yet signed." even after the
  // parent + teacher have both signed.
  const student = getUsers().find(u => u.email.toLowerCase() === record.studentEmail.toLowerCase())
  if (student?.id) {
    void uploadWaiverRecord(student.id, record)
  }
}

/** Internal helper — local writes only, no server push (used by
 *  hydrateWaiverForStudent so we don't bounce what we just fetched
 *  back up to the server). */
function saveWaiverLocal(record: WaiverRecord) {
  const all = getWaivers()
  const idx = all.findIndex(w => w.id === record.id)
  if (idx >= 0) all[idx] = record
  else all.push(record)
  writeWaivers(all)
}

/** Persist the full WaiverRecord JSON server-side by reusing the
 *  existing document-blob store under a fixed docKey. Lets us keep
 *  the structured record (witness sig, SCEI ack sig, etc.) in sync
 *  across devices without needing a new Prisma model + migration. */
async function uploadWaiverRecord(studentId: string, record: WaiverRecord): Promise<void> {
  try {
    const json = JSON.stringify(record)
    const file = new File([new Blob([json], { type: 'application/json' })], 'waiver-record.json', { type: 'application/json' })
    await uploadDocumentBlob(studentId, 'waiver_record', file)
  } catch (e) {
    console.warn('[uploadWaiverRecord]', e)
  }
}

/** Fetch the server-stored WaiverRecord for a student and merge it
 *  into the local cache **only if the server copy is newer than the
 *  local one**. Returns the record we ended up keeping (whichever was
 *  newer) so callers can update React state. Null on miss / auth
 *  failure — caller keeps showing whatever's in local cache.
 *
 *  IMPORTANT — the old version always overwrote local with the server
 *  blob. That was unsafe: a parent who'd only signed parentSig could
 *  push their partial record to the server via syncLocalWaiversToServer,
 *  and the next time the witness teacher's hydrate fired the partial
 *  server version would wipe out their local witnessSig. The
 *  updatedAt comparison below prevents that regression.
 */
export async function hydrateWaiverForStudent(studentId: string): Promise<WaiverRecord | null> {
  if (typeof window === 'undefined') return null
  const tok = getToken()
  if (!tok) return null
  try {
    const res = await fetch(
      `${backendOrigin()}/api/public/class-portal/document-blobs/${encodeURIComponent(studentId)}/waiver_record`,
      { headers: { authorization: `Bearer ${tok}` } },
    )
    if (!res.ok) return null
    const text = await res.text()
    const remote = JSON.parse(text) as WaiverRecord
    // Compare to whatever's in local cache. Only overwrite when the
    // server's updatedAt is strictly newer — equal or older keeps the
    // local copy (which might be a superset, e.g. carries a witness
    // signature the server hasn't seen yet because that device hasn't
    // synced).
    const local = getWaivers().find(w => w.id === remote.id)
    if (!local) {
      saveWaiverLocal(remote)
      return remote
    }
    const localTs = new Date(local.updatedAt).getTime()
    const remoteTs = new Date(remote.updatedAt).getTime()
    if (Number.isFinite(remoteTs) && Number.isFinite(localTs) && remoteTs > localTs) {
      saveWaiverLocal(remote)
      return remote
    }
    // Local is newer-or-equal: try to push it up so the server catches
    // up. Fire-and-forget; we don't want to block render. Returns the
    // local copy unchanged.
    void uploadWaiverRecord(studentId, local)
    return local
  } catch (e) {
    console.warn('[hydrateWaiverForStudent]', e)
    return null
  }
}

/** Existence-only probe — does the server have a waiver_record blob
 *  for this student? Does NOT write to local cache, so syncing logic
 *  can ask "is the server stale?" without inadvertently overwriting
 *  the caller's local record. */
async function hasServerWaiverRecord(studentId: string): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const tok = getToken()
  if (!tok) return false
  try {
    const res = await fetch(
      `${backendOrigin()}/api/public/class-portal/document-blobs/${encodeURIComponent(studentId)}/waiver_record`,
      { method: 'GET', headers: { authorization: `Bearer ${tok}`, range: 'bytes=0-0' } },
    )
    return res.ok || res.status === 206
  } catch { return false }
}

/** Probe for the server-stored PDF copy of the signed waiver. Used as
 *  a fallback signal when no structured `waiver_record` JSON exists on
 *  the server — common for any waiver signed BEFORE PR #169 deployed
 *  (the SCEI-ACK flow uploaded the PDF as `parent_waiver`, but the
 *  structured JSON was never persisted). HEAD-style probe via a small
 *  ranged GET so we don't pull the whole PDF just to check existence. */
export async function hasServerWaiverPdf(studentId: string): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const tok = getToken()
  if (!tok) return false
  try {
    const res = await fetch(
      `${backendOrigin()}/api/public/class-portal/document-blobs/${encodeURIComponent(studentId)}/parent_waiver`,
      {
        method: 'GET',
        headers: { authorization: `Bearer ${tok}`, range: 'bytes=0-0' },
      },
    )
    // 200 (full body) or 206 (partial content) both mean the row exists.
    return res.ok || res.status === 206
  } catch { return false }
}

/** Fetch the full PDF blob of the signed waiver from the server.
 *  Used by the View/Download buttons when we don't have a structured
 *  WaiverRecord to regenerate the PDF from. */
export async function fetchServerWaiverPdfBlob(studentId: string): Promise<Blob | null> {
  if (typeof window === 'undefined') return null
  const tok = getToken()
  if (!tok) return null
  try {
    const res = await fetch(
      `${backendOrigin()}/api/public/class-portal/document-blobs/${encodeURIComponent(studentId)}/parent_waiver`,
      { headers: { authorization: `Bearer ${tok}` } },
    )
    if (!res.ok) return null
    return await res.blob()
  } catch { return null }
}

/** Push any local WaiverRecord rows up to the server, ONE PER STUDENT.
 *  Only pushes if the server doesn't already have a record for that
 *  student. Existence is checked via a non-destructive HEAD-style
 *  probe so we don't accidentally pull a partial server copy into
 *  the local cache and clobber a more-complete local record (e.g.
 *  one that carries a witnessSig the server hasn't seen yet because
 *  the witness teacher's device hasn't synced yet).
 *
 *  Runs fire-and-forget after every sign-in and on every
 *  StudentListPanel mount, so whichever device the SCEI-ACK signer
 *  used eventually pushes the full structured record — closing the
 *  gap for any waiver signed before PR #169 deployed.
 */
export async function syncLocalWaiversToServer(): Promise<number> {
  if (typeof window === 'undefined') return 0
  if (!getToken()) return 0
  const all = getWaivers()
  if (all.length === 0) return 0
  const users = getUsers()
  let pushed = 0
  for (const w of all) {
    const student = users.find(u => u.email.toLowerCase() === w.studentEmail.toLowerCase())
    if (!student?.id) continue
    // Non-destructive existence check — does NOT mutate local cache,
    // unlike hydrateWaiverForStudent. Avoids racing-overwrite when
    // multiple signers each hold a different snapshot in their
    // localStorage.
    const onServer = await hasServerWaiverRecord(student.id)
    if (onServer) continue
    await uploadWaiverRecord(student.id, w)
    pushed += 1
  }
  return pushed
}

export function findPendingWaivers(): WaiverRecord[] {
  // "Pending" = parent signed but witness has not.
  return getWaivers().filter(w => !w.witnessSig)
}

/* ─────────────────────────────────────────────────────────────────
   Payments — record student payments after PayMongo checkout
   ───────────────────────────────────────────────────────────── */

const PAYMENTS_KEY = 'scei_class_payments_v1'

export type PaymentPlan = 'ANNUAL' | 'BIANNUAL' | 'MONTHLY'
export type PaymentStatus = 'PENDING' | 'PAID'
export type PaymentMethod = 'PAYMONGO' | 'FRONT_DESK_CASH' | 'BANK_DEPOSIT'

export interface PaymentRecord {
  id: string
  studentId: string
  studentEmail: string
  plan: PaymentPlan
  /** Tuition portion in PHP centavos. */
  tuitionAmount: number
  /** Miscellaneous portion in PHP centavos. */
  miscAmount: number
  /** Period covered, free text — e.g. "Annual SY 2026–2027", "Aug 2026", "Aug–Jan 2026". */
  period: string
  /** Voucher applied at checkout, if any. tuitionAmount is already discounted. */
  voucherCode?: string
  /** Percent discount applied to tuition via the voucher. */
  discountPercent?: number
  /** Tuition before the voucher discount, for audit / receipts. */
  tuitionBeforeDiscount?: number
  status: PaymentStatus
  /** How the parent chose to pay. Defaults to PAYMONGO for back-compat. */
  method?: PaymentMethod
  paymongoCheckoutId?: string
  paymongoCheckoutUrl?: string
  /** IndexedDB blob ref for the deposit slip / proof of payment (BANK_DEPOSIT). */
  proofFileId?: string
  proofFileName?: string
  proofFileSize?: number
  proofFileType?: string
  paidAt?: string
  createdAt: string
}

export function getPayments(): PaymentRecord[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(PAYMENTS_KEY) ?? '[]') } catch { return [] }
}
function writePayments(p: PaymentRecord[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(PAYMENTS_KEY, JSON.stringify(p))
}
export function savePayment(p: PaymentRecord) {
  const all = getPayments()
  const idx = all.findIndex(x => x.id === p.id)
  if (idx >= 0) all[idx] = p
  else all.push(p)
  writePayments(all)
}
export function getPaymentsForStudent(studentId: string): PaymentRecord[] {
  return getPayments().filter(p => p.studentId === studentId)
}
export function studentHasActivePayment(studentId: string): boolean {
  return getPaymentsForStudent(studentId).some(p => p.status === 'PAID')
}

/** Instrument detail when method = FRONT_DESK_CASH ("Frontdesk payment"
 *  in the UI). Null is treated as CASH for display + accounting. */
export type FrontDeskMethodDetail = 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'GCASH' | 'PAYMAYA'

export interface FrontDeskPaymentRow {
  id: string
  classPortalPaymentId: string
  studentId: string
  studentEmail: string
  studentName: string
  branch: 'EAST' | 'GREENHILLS'
  plan: PaymentPlan
  tuitionCentavos: number
  miscCentavos: number
  period: string
  method: 'FRONT_DESK_CASH' | 'BANK_DEPOSIT' | 'PAYMONGO' | null
  /** Instrument detail. Only meaningful when method=FRONT_DESK_CASH;
   *  null on legacy rows + on Bank deposit / PayMongo. */
  methodDetail: FrontDeskMethodDetail | null
  status: 'PENDING' | 'CONVERTED' | 'VOIDED'
  /** Free-text remarks / accounting-hub reconciliation notes. */
  notes: string | null
  createdAt: string
  convertedAt: string | null
}

/**
 * Server-side view of every front-desk-bound tuition payment the logged-in
 * staffer can see (scoped to their branch for FRONTDESK + BRANCH_ADMIN;
 * unscoped for ADMIN). Used by the /frontdesk Payments tab so confirmers
 * see payments submitted from any device — not just their own browser.
 */
export async function getFrontDeskPaymentsServer(): Promise<FrontDeskPaymentRow[]> {
  if (typeof window === 'undefined') return []
  if (!getToken()) return []
  try {
    const { payments } = await backendJson<{ payments: FrontDeskPaymentRow[] }>('/api/public/class-portal/frontdesk-payments')
    return payments
  } catch (e) {
    console.warn('[getFrontDeskPaymentsServer] failed:', e)
    return []
  }
}

/**
 * Admin/branch-admin/frontdesk records a PayMongo payment that landed
 * outside the success-redirect flow (e.g. the parent paid on a different
 * device, cleared their browser, or otherwise never landed back on
 * /pay/success so no server-side row was ever created).
 *
 * Creates a `ClassPortalFrontDeskPayment` row with method='PAYMONGO',
 * status='PENDING' — which makes it surface in the accounting-hub POS
 * queue exactly like a bank-deposit row. The cashier then clicks
 * "Convert to Order" as normal; the order is created, the row flips to
 * CONVERTED, and the student's profile shows PAID on next hydrate.
 *
 * `notes` should carry the PayMongo reference number / receipt no so
 * the cashier and audit trail can match the row to the actual gateway
 * transaction.
 */
export async function recordPayMongoPayment(args: {
  studentId: string
  studentEmail: string
  studentName: string
  branch: 'EAST' | 'GREENHILLS'
  plan: PaymentPlan
  /** Total amount the parent paid via PayMongo, in PHP centavos. */
  tuitionCentavos: number
  miscCentavos?: number
  /** Free text — e.g. "AY 2026–2027" or "Aug 2026". */
  period: string
  notes?: string
}): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!getToken()) return false
  try {
    const tok = getToken()
    // Unique dedupe key so the upsert doesn't collide with a real
    // class-portal-originated payment. cuid-ish: prefix + 20 chars of
    // base36 randomness. The /pay flow uses different prefixes.
    const classPortalPaymentId =
      'pmgr_' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12)
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/frontdesk-payments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(tok ? { authorization: `Bearer ${tok}` } : {}),
      },
      body: JSON.stringify({
        classPortalPaymentId,
        studentId: args.studentId,
        studentEmail: args.studentEmail,
        studentName: args.studentName,
        branch: args.branch,
        plan: args.plan,
        tuitionCentavos: args.tuitionCentavos,
        miscCentavos: args.miscCentavos ?? 0,
        period: args.period,
        method: 'PAYMONGO',
        notes: args.notes ?? null,
      }),
    })
    if (!res.ok) {
      console.warn('[recordPayMongoPayment] failed:', res.status)
      return false
    }
    return true
  } catch (e) {
    console.warn('[recordPayMongoPayment] error:', e)
    return false
  }
}

/**
 * Generic "record a payment on behalf of a student" helper for the
 * front desk. Used when the parent never opened /pay themselves —
 * staff already has the cash, the bank slip, or the PayMongo receipt
 * in hand and needs to log it into the system so it lands on the
 * accounting-hub POS queue same as any other front-desk payment.
 *
 * Returns the new PENDING row's classPortalPaymentId on success so the
 * caller can optionally one-click Confirm it right after; returns null
 * on any failure (network, auth, validation).
 */
export async function recordPaymentOnBehalfOf(args: {
  studentId: string
  studentEmail: string
  studentName: string
  branch: 'EAST' | 'GREENHILLS'
  plan: PaymentPlan
  method: 'FRONT_DESK_CASH' | 'BANK_DEPOSIT' | 'PAYMONGO'
  /** Required when method = FRONT_DESK_CASH. Ignored otherwise. */
  methodDetail?: FrontDeskMethodDetail
  /** Tuition amount in PHP centavos. */
  tuitionCentavos: number
  miscCentavos?: number
  /** Free text — e.g. "AY 2026–2027" or "Aug 2026". */
  period: string
  /** Optional reference number / receipt no. — surfaced as a notes line. */
  reference?: string
  /** Optional extra context appended to the auto-generated notes. */
  extraNotes?: string
}): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const tok = getToken()
  if (!tok) return null
  try {
    // Per-method prefix on the dedupe key keeps these distinct from
    // student-originated /pay rows in any future audit.
    const prefix =
      args.method === 'PAYMONGO'         ? 'pmgr_' :
      args.method === 'BANK_DEPOSIT'     ? 'bnks_' :
                                            'cshs_'
    const classPortalPaymentId =
      prefix + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12)

    // Compose a readable notes line — the front-desk staff sees this on
    // the queue row and the cashier sees it on the Convert-to-Order
    // screen, so it's worth being descriptive.
    // For FRONT_DESK_CASH we surface the instrument detail in the
    // method label too so the cashier sees "Frontdesk payment (GCash)"
    // rather than a generic label.
    const detailLabel =
      args.methodDetail === 'CASH'        ? 'Cash' :
      args.methodDetail === 'CREDIT_CARD' ? 'Credit Card' :
      args.methodDetail === 'DEBIT_CARD'  ? 'Debit Card' :
      args.methodDetail === 'GCASH'       ? 'GCash' :
      args.methodDetail === 'PAYMAYA'     ? 'PayMaya' :
                                             null
    const methodLabel =
      args.method === 'PAYMONGO'         ? 'PayMongo' :
      args.method === 'BANK_DEPOSIT'     ? 'Bank deposit' :
      detailLabel                          ? `Frontdesk payment (${detailLabel})` :
                                            'Frontdesk payment'
    let notes = `${methodLabel} · logged by front desk on behalf of student`
    if (args.reference?.trim()) notes += ` · ref ${args.reference.trim()}`
    if (args.extraNotes?.trim()) notes += ` · ${args.extraNotes.trim()}`

    const res = await fetch(`${backendOrigin()}/api/public/class-portal/frontdesk-payments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tok}`,
      },
      body: JSON.stringify({
        classPortalPaymentId,
        studentId: args.studentId,
        studentEmail: args.studentEmail,
        studentName: args.studentName,
        branch: args.branch,
        plan: args.plan,
        tuitionCentavos: args.tuitionCentavos,
        miscCentavos: args.miscCentavos ?? 0,
        period: args.period,
        method: args.method,
        methodDetail: args.method === 'FRONT_DESK_CASH' ? (args.methodDetail ?? 'CASH') : null,
        notes,
      }),
    })
    if (!res.ok) {
      console.warn('[recordPaymentOnBehalfOf] failed:', res.status)
      return null
    }
    return classPortalPaymentId
  } catch (e) {
    console.warn('[recordPaymentOnBehalfOf] error:', e)
    return null
  }
}

/**
 * Main-admin-only hard delete of a queued PENDING row. Used to clean up
 * test rows created during system trials. CONVERTED rows refuse to
 * delete (return false) — void the associated accounting-hub order
 * first.
 */
export async function deleteFrontDeskPayment(classPortalPaymentId: string): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!getToken()) return false
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/frontdesk-payments/${encodeURIComponent(classPortalPaymentId)}`, {
      method: 'DELETE',
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) {
      console.warn('[deleteFrontDeskPayment] failed:', res.status)
      return false
    }
    return true
  } catch (e) {
    console.warn('[deleteFrontDeskPayment] error:', e)
    return false
  }
}

/**
 * Per-student annualized fee summary used to render the registration
 * letter + fee schedule PDFs. Tuition is summed across the student's
 * recorded ClassPortalFrontDeskPayment rows for the current SY — so
 * front-desk overrides on individual rows flow through automatically.
 */
export interface FeeSummary {
  student: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
    fullName: string
    level: EnrollmentLevel | null
    branch: 'EAST' | 'GREENHILLS' | null
  }
  schoolYear: string                  // "2026-2027"
  plan: string                        // PaymentPlan as string
  /** Net annual tuition (post-misc-allocation, post any discount). */
  annualTuitionCentavos: number
  /** Flat ₱5,000 / year, bundled pro-rata into each installment. */
  annualMiscCentavos: number
  /** Combined annual (net tuition + misc) = what the parent will
   *  have paid by SY-end. For monthly/biannual this is per-installment
   *  × installment count. */
  annualTotalCentavos: number
  /** Single-installment total (combined). For ANNUAL = annualTotal. */
  installmentCentavos: number
  installmentCount: number             // 1 / 2 / 10
  /** Actually paid amounts so far (= CONVERTED rows only). */
  paidTuitionCentavos: number          // legacy alias for paidTotal
  paidMiscCentavos: number             // 0 — misc is bundled
  paidTotalCentavos: number
  paymentRowCount: number              // 0 means staff hasn't recorded yet
  convertedRowCount: number            // how many of those are CONVERTED
}

export async function fetchFeeSummary(studentId: string): Promise<FeeSummary | null> {
  if (typeof window === 'undefined') return null
  if (!getToken()) return null
  try {
    return await backendJson<FeeSummary>(`/api/public/class-portal/students/${encodeURIComponent(studentId)}/fee-summary`)
  } catch (e) {
    console.warn('[fetchFeeSummary] failed:', e)
    return null
  }
}

/**
 * Personal (student-locked) voucher. Only redeemable by the student
 * whose id matches dedicatedStudentId. Powers the "personal early-
 * bird voucher" feature: after AURA30 expired, existing early-bird
 * students each get their own dedicated code so their remaining
 * monthly / bi-annual installments still get 30% off.
 */
export interface PersonalVoucher {
  id: string
  code: string
  discountPercent: number
  validUntil: string          // ISO
  enabled: boolean
  dedicatedStudentId: string
  issuedAt: string            // ISO
  issuedBy: string | null     // email of staff who minted it
}

export async function listPersonalVouchersFor(studentId: string): Promise<PersonalVoucher[]> {
  if (typeof window === 'undefined') return []
  if (!getToken()) return []
  try {
    const { vouchers } = await backendJson<{ vouchers: PersonalVoucher[] }>(`/api/public/class-portal/students/${encodeURIComponent(studentId)}/personal-vouchers`)
    return vouchers
  } catch (e) {
    console.warn('[listPersonalVouchersFor] failed:', e)
    return []
  }
}

export async function mintPersonalVoucher(args: {
  studentId: string
  discountPercent?: number     // default 30
  validUntil?: string          // ISO; default end of SY
}): Promise<PersonalVoucher | { error: string }> {
  if (typeof window === 'undefined') return { error: 'server-side' }
  if (!getToken()) return { error: 'not authenticated' }
  try {
    const { voucher } = await backendJson<{ voucher: PersonalVoucher }>('/api/public/class-portal/vouchers/mint-personal', {
      method: 'POST',
      body: JSON.stringify(args),
    })
    return voucher
  } catch (e) {
    return { error: (e as Error).message || 'Could not mint voucher.' }
  }
}

export interface IssuedRegistrationLetter {
  id: string
  referenceNumber: string             // AURA-REG-YYYY-NNNN
  issuedAt: string                    // ISO
  issuedBy: string                    // email
  annualTuitionCentavos: number
  annualMiscCentavos: number
  annualTotalCentavos: number
}

export async function issueRegistrationLetter(studentId: string): Promise<IssuedRegistrationLetter | null> {
  if (typeof window === 'undefined') return null
  if (!getToken()) return null
  try {
    const { letter } = await backendJson<{ letter: IssuedRegistrationLetter }>(
      `/api/public/class-portal/students/${encodeURIComponent(studentId)}/issue-registration-letter`,
      { method: 'POST', body: JSON.stringify({}) },
    )
    return letter
  } catch (e) {
    console.warn('[issueRegistrationLetter] failed:', e)
    return null
  }
}

/**
 * Flip a queued front-desk payment from PENDING → CONVERTED. Triggers the
 * student's local PaymentRecord to hydrate to PAID on next refresh.
 * Returns true on success.
 */
export async function confirmFrontDeskPayment(classPortalPaymentId: string): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!getToken()) return false
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/frontdesk-payments/${encodeURIComponent(classPortalPaymentId)}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...(tok ? { authorization: `Bearer ${tok}` } : {}),
      },
      body: JSON.stringify({ status: 'CONVERTED' }),
    })
    if (!res.ok) {
      console.warn('[confirmFrontDeskPayment] failed:', res.status)
      return false
    }
    return true
  } catch (e) {
    console.warn('[confirmFrontDeskPayment] error:', e)
    return false
  }
}

/**
 * Generic patch helper for a front-desk-payment row. Use case:
 * reconciling the class-portal row with the accounting-hub Order
 * (amount mismatch, wrong submission/confirmation date, missing
 * remarks). Same auth as confirm/method-change: admin unscoped,
 * front desk branch-scoped server-side.
 */
export interface FrontDeskPaymentPatch {
  notes?: string | null
  method?: 'PAYMONGO' | 'BANK_DEPOSIT' | 'FRONT_DESK_CASH'
  /** Instrument detail. Required when switching TO FRONT_DESK_CASH;
   *  ignored on other methods. Null clears it. */
  methodDetail?: FrontDeskMethodDetail | null
  tuitionCentavos?: number
  miscCentavos?: number
  plan?: string
  period?: string
  /** ISO 8601 string. createdAt = "Submitted at". */
  createdAt?: string
  /** ISO 8601 string or null to clear. convertedAt = "Confirmed at". */
  convertedAt?: string | null
}

export async function patchFrontDeskPayment(
  classPortalPaymentId: string,
  patch: FrontDeskPaymentPatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof window === 'undefined') return { ok: false, error: 'server-side' }
  if (!getToken()) return { ok: false, error: 'not authenticated' }
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/frontdesk-payments/${encodeURIComponent(classPortalPaymentId)}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...(tok ? { authorization: `Bearer ${tok}` } : {}),
      },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      const msg = (j?.error as string) || `HTTP ${res.status}`
      return { ok: false, error: msg }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Change the recorded payment method on a front-desk-payment row.
 * Use case: a row was logged under the wrong method (e.g. PAYMONGO
 * but the parent actually deposited at the bank). Admin and front-
 * desk (branch-scoped) can correct this without deleting the row.
 */
export async function changeFrontDeskPaymentMethod(
  classPortalPaymentId: string,
  method: 'PAYMONGO' | 'BANK_DEPOSIT' | 'FRONT_DESK_CASH',
): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!getToken()) return false
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/frontdesk-payments/${encodeURIComponent(classPortalPaymentId)}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...(tok ? { authorization: `Bearer ${tok}` } : {}),
      },
      body: JSON.stringify({ method }),
    })
    if (!res.ok) {
      console.warn('[changeFrontDeskPaymentMethod] failed:', res.status)
      return false
    }
    return true
  } catch (e) {
    console.warn('[changeFrontDeskPaymentMethod] error:', e)
    return false
  }
}

/**
 * Pull the marketing-hub view of class-portal front-desk payments and
 * reconcile this device's local PaymentRecord cache against the server's
 * truth. Two-way:
 *
 *   - If a local row exists, its status is flipped to match the server
 *     (CONVERTED → PAID, PENDING/VOIDED → PENDING).
 *   - If a local row does NOT exist for a server row, materialize one.
 *     Without this, an admin / teacher / branch admin viewing the student
 *     list would see "Pending" or "No payment" for any student who paid
 *     on a different device — because their local cache was empty even
 *     though the server clearly has a CONVERTED record.
 */
export async function hydrateFrontDeskPayments(): Promise<PaymentRecord[]> {
  if (typeof window === 'undefined') return getPayments()
  if (!getToken()) return getPayments()
  try {
    const { payments } = await backendJson<{
      payments: Array<{
        classPortalPaymentId: string
        studentId: string
        studentEmail: string
        plan: string
        tuitionCentavos: number
        miscCentavos: number
        period: string
        method: 'FRONT_DESK_CASH' | 'BANK_DEPOSIT' | 'PAYMONGO' | null
        status: 'PENDING' | 'CONVERTED' | 'VOIDED'
        createdAt: string
        convertedAt: string | null
      }>
    }>('/api/public/class-portal/frontdesk-payments')
    const local = getPayments()
    const localById = new Map(local.map(r => [r.id, r]))
    const next: PaymentRecord[] = local.slice()
    let mutated = false

    for (const remote of payments) {
      const existing = localById.get(remote.classPortalPaymentId)
      const targetStatus: PaymentStatus = remote.status === 'CONVERTED' ? 'PAID' : 'PENDING'
      if (existing) {
        // Update status if it drifted from the server's view.
        const idx = next.findIndex(r => r.id === existing.id)
        if (existing.status !== targetStatus) {
          mutated = true
          if (targetStatus === 'PAID') {
            next[idx] = { ...existing, status: 'PAID', paidAt: remote.convertedAt ?? new Date().toISOString() }
          } else {
            const { paidAt: _drop, ...rest } = existing
            void _drop
            next[idx] = { ...rest, status: 'PENDING' }
          }
        }
        continue
      }
      // No local row for this server-side payment — materialize one so
      // local readers (PaymentsGrouped, PaidStudentsSpreadsheet,
      // paymentStatusFor, etc.) see the correct PAID status.
      mutated = true
      next.push({
        id: remote.classPortalPaymentId,
        studentId: remote.studentId,
        studentEmail: remote.studentEmail,
        plan: (remote.plan as PaymentPlan) ?? 'MONTHLY',
        tuitionAmount: remote.tuitionCentavos,
        miscAmount: remote.miscCentavos,
        period: remote.period,
        status: targetStatus,
        method: remote.method ?? undefined,
        paidAt: remote.status === 'CONVERTED' ? (remote.convertedAt ?? new Date().toISOString()) : undefined,
        createdAt: remote.createdAt,
      })
    }
    if (mutated) writePayments(next)
    return next
  } catch { return getPayments() }
}

/**
 * Headline payment status for a student, used in the admin/teacher
 * student list and the student's own dashboard banner.
 *   PAID    → at least one payment is in the PAID state
 *   PENDING → all payments are PENDING (parent started checkout but didn't pay)
 *   NONE    → no payment record at all (parent never opened the pay page)
 */
export function paymentStatusFor(studentId: string): 'PAID' | 'PENDING' | 'NONE' {
  const list = getPaymentsForStudent(studentId)
  if (list.length === 0) return 'NONE'
  if (list.some(p => p.status === 'PAID')) return 'PAID'
  return 'PENDING'
}

/**
 * Plan-aware, current-period payment status for the front-desk +
 * admin Students list. Answers the question "does this student owe
 * money RIGHT NOW?" rather than "have they paid ever?".
 *
 *   PAID → current period's installment is already PAID.
 *          • ANNUAL:   any PAID row exists for the SY
 *          • BIANNUAL: the currently-active tranche is PAID
 *                      (first half up to Dec 5, second half after)
 *          • MONTHLY:  a PAID row whose period covers the current
 *                      calendar month exists (handles both "July 2026"
 *                      and back-balance ranges like "Back balance ·
 *                      June–September 2026")
 *   DUE  → student has a plan on file but the current period isn't
 *          paid yet. Front desk should be actively charging.
 *   NONE → no payment record at all — parent never opened /pay.
 */
export function currentPeriodPaymentStatusFor(studentId: string): 'PAID' | 'DUE' | 'NONE' {
  const list = getPaymentsForStudent(studentId)
  if (list.length === 0) return 'NONE'

  const plan = inferPaymentPlanFor(studentId)
  // Unknown plan → fall back to any-PAID semantics so we don't
  // suddenly mark long-paid students as DUE.
  if (!plan) return list.some(p => p.status === 'PAID') ? 'PAID' : 'DUE'

  const today = new Date()
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  const currentMonthName = monthNames[today.getMonth()]

  if (plan === 'ANNUAL') {
    // Annual is one lump per SY. Any PAID row = current period covered.
    return list.some(p => p.status === 'PAID') ? 'PAID' : 'DUE'
  }

  if (plan === 'MONTHLY') {
    const covered = list.some(p => p.status === 'PAID' && periodCoversMonth(p.period, currentMonthName))
    return covered ? 'PAID' : 'DUE'
  }

  if (plan === 'BIANNUAL') {
    // First half runs Jun 5 – Dec 4 (before Dec 5 due date). Second half
    // runs Dec 5 – Jun 4 next year. We treat Dec 5 as the boundary.
    const m = today.getMonth()
    const d = today.getDate()
    const inSecondHalf = (m === 11 && d >= 5) || (m >= 0 && m <= 4)
    const halfRegex = inSecondHalf ? /second[- ]?half/i : /first[- ]?half/i
    const covered = list.some(p => p.status === 'PAID' && p.plan === 'BIANNUAL' && halfRegex.test(p.period))
    return covered ? 'PAID' : 'DUE'
  }

  return 'DUE'
}

/**
 * Does a PaymentRecord's `period` string cover the given calendar
 * month? Handles two shapes:
 *   • Direct match:  "July 2026" covers "July"
 *   • Back-balance range: "Back balance · June–September 2026" covers
 *                          any month from June through September
 */
function periodCoversMonth(period: string, targetMonthName: string): boolean {
  if (!period) return false
  if (period.includes(targetMonthName)) return true
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  const m = period.match(/([A-Z][a-z]+)\s*[–-]\s*([A-Z][a-z]+)/)
  if (!m) return false
  const startIdx = monthNames.indexOf(m[1])
  const endIdx = monthNames.indexOf(m[2])
  const targetIdx = monthNames.indexOf(targetMonthName)
  if (startIdx < 0 || endIdx < 0 || targetIdx < 0) return false
  // Normal range (Jun–Sep). SY doesn't wrap monthly ranges in practice
  // (back-balance always starts in June and ends in the current month),
  // but handle wrap-around defensively for anything year-spanning.
  if (startIdx <= endIdx) return targetIdx >= startIdx && targetIdx <= endIdx
  return targetIdx >= startIdx || targetIdx <= endIdx
}

/** Most recent payment record (by createdAt) for a student, if any. */
export function latestPaymentFor(studentId: string): PaymentRecord | undefined {
  const list = getPaymentsForStudent(studentId)
  if (list.length === 0) return undefined
  return list.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
}

/* ─────────────────────────────────────────────────────────────────
   Automatic payment reminders — purely date-driven, no scheduler.
   Computed on render against `today`, the student's chosen plan,
   and existing PAID payments so paid families don't get pestered.
   ───────────────────────────────────────────────────────────── */

export interface PaymentReminder {
  id: string
  /** Synthetic so it doesn't collide with stored NotificationRecord IDs. */
  studentId: string
  studentEmail: string
  studentName: string
  plan: PaymentPlan
  title: string
  body: string
  /** ISO date the deadline is calculated against. */
  dueOn: string
  /** Severity: 'INFO' (reminder in window) vs 'WARNING' (past due). */
  severity: 'INFO' | 'WARNING'
  /** When the reminder window opens (used by callers to sort). */
  windowOpensAt: string
}

function monthName(monthIdx: number): string {
  return ['January','February','March','April','May','June','July','August','September','October','November','December'][monthIdx]
}

function isoDate(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
}

/**
 * Compute payment reminders that should be visible to a single student
 * (and by extension their admin) for the given calendar date.
 *
 *   BIANNUAL → window opens one full month before each tranche deadline
 *              (May 5 for the June 5 first half, Nov 5 for the Dec 5 second half).
 *   MONTHLY  → window opens on the 30th of the previous month and runs
 *              through the 5th-of-month deadline. (Feb fallback: last day.)
 *
 * Reminders are suppressed when a PAID payment already covers the period.
 */
export function remindersForStudentOn(
  studentId: string,
  studentEmail: string,
  studentName: string,
  plan: PaymentPlan,
  today: Date = new Date(),
): PaymentReminder[] {
  const out: PaymentReminder[] = []
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
  const paid = getPaymentsForStudent(studentId).filter(p => p.status === 'PAID')

  function emit(r: Omit<PaymentReminder, 'id' | 'studentId' | 'studentEmail' | 'studentName' | 'plan'>) {
    out.push({
      id: `rem_${studentId}_${plan}_${r.dueOn}`,
      studentId, studentEmail, studentName, plan,
      ...r,
    })
  }

  if (plan === 'BIANNUAL') {
    // First half: window May 5 – June 5 (school year starts in June)
    // Second half: window Nov 5 – Dec 5
    const tranches: Array<{ windowOpen: Date; dueDate: Date; label: string; period: string }> = [
      { windowOpen: new Date(y, 4, 5),  dueDate: new Date(y, 5, 5),  label: '1st semester', period: `First half SY ${y}–${y + 1}` },
      { windowOpen: new Date(y, 10, 5), dueDate: new Date(y, 11, 5), label: '2nd semester', period: `Second half SY ${y}–${y + 1}` },
    ]
    for (const t of tranches) {
      const alreadyPaid = paid.some(p => p.period === t.period)
      if (alreadyPaid) continue
      const overdue = today > t.dueDate
      if (today < t.windowOpen) continue // window not yet open
      emit({
        title: `Bi-annual tuition — ${t.label} due ${monthName(t.dueDate.getMonth())} 5`,
        body: overdue
          ? `Your bi-annual tuition for the ${t.period.toLowerCase()} was due ${monthName(t.dueDate.getMonth())} 5. Please complete payment via PayMongo on the /pay page.`
          : `Your bi-annual tuition for the ${t.period.toLowerCase()} is due on ${monthName(t.dueDate.getMonth())} 5. Please complete payment via PayMongo on the /pay page.`,
        dueOn: isoDate(t.dueDate.getFullYear(), t.dueDate.getMonth(), t.dueDate.getDate()),
        severity: overdue ? 'WARNING' : 'INFO',
        windowOpensAt: t.windowOpen.toISOString(),
      })
    }
  }

  if (plan === 'MONTHLY') {
    // Window opens on the 30th of the previous month, closes on the 5th of the current month.
    // After the 5th, the next month's reminder takes over (and shows the prior period as overdue
    // until paid — but we keep it scoped to "current" period for simplicity).
    const prevMonth = (m + 11) % 12
    const prevMonthYear = m === 0 ? y - 1 : y
    const prevMonthLastDay = new Date(prevMonthYear, prevMonth + 1, 0).getDate()
    const windowOpenDay = Math.min(30, prevMonthLastDay)
    const inWindow =
      // After (or on) the 30th of last month
      (today >= new Date(prevMonthYear, prevMonth, windowOpenDay)) &&
      // And up to (and including) the 5th of this month
      (today <= new Date(y, m, 5, 23, 59, 59))

    if (inWindow) {
      const period = `${monthName(m)} ${y}`
      const alreadyPaid = paid.some(p => p.period === period)
      if (!alreadyPaid) {
        const overdue = today > new Date(y, m, 5, 23, 59, 59)
        emit({
          title: `Monthly tuition — ${period} due ${monthName(m)} 5`,
          body: overdue
            ? `Your monthly tuition for ${period} was due ${monthName(m)} 5. Please complete payment via PayMongo on the /pay page.`
            : `Your monthly tuition for ${period} is due on ${monthName(m)} 5. Please complete payment via PayMongo on the /pay page.`,
          dueOn: isoDate(y, m, 5),
          severity: overdue ? 'WARNING' : 'INFO',
          windowOpensAt: new Date(prevMonthYear, prevMonth, windowOpenDay).toISOString(),
        })
      }
    }
    // Also flag any *prior* unpaid month as overdue. Look back up to 3 months.
    // Only fire when an actual PaymentRecord exists for that period — otherwise
    // a brand-new enrollee (not yet billed for prior months) would see false
    // OVERDUE notices for months before they joined.
    const allRecords = getPaymentsForStudent(studentId)
    for (let back = 1; back <= 3; back++) {
      const mm = (m + 12 - back) % 12
      const yy = m - back < 0 ? y - 1 : y
      const period = `${monthName(mm)} ${yy}`
      const hasRecord = allRecords.some(p => p.period === period)
      if (!hasRecord) continue
      const alreadyPaid = paid.some(p => p.period === period)
      if (alreadyPaid) continue
      // Only emit if today is past the 5th of that month
      const due = new Date(yy, mm, 5, 23, 59, 59)
      if (today <= due) continue
      emit({
        title: `Monthly tuition — ${period} OVERDUE`,
        body: `Monthly tuition for ${period} is past due (deadline was ${monthName(mm)} 5${yy !== y ? `, ${yy}` : ''}). Please complete payment as soon as possible.`,
        dueOn: isoDate(yy, mm, 5),
        severity: 'WARNING',
        windowOpensAt: due.toISOString(),
      })
    }
  }

  return out
}

/**
 * Pick the plan to show reminders for. If the student has any payment
 * record (even PENDING), use that plan; otherwise return undefined so
 * callers can decide whether to show a generic "no payment yet" reminder.
 */
export function inferPaymentPlanFor(studentId: string): PaymentPlan | undefined {
  const latest = latestPaymentFor(studentId)
  return latest?.plan
}

/* ─────────────────────────────────────────────────────────────────
   Notifications — admin + teacher create, students read
   ───────────────────────────────────────────────────────────── */

const NOTIFICATIONS_KEY = 'scei_class_notifications_v1'

export type NotifAuthor = 'ADMIN' | 'TEACHER'

export interface NotificationRecord {
  id: string
  title: string
  body: string
  authorRole: NotifAuthor
  authorName: string
  authorId?: string
  /** Empty list = applies to all levels. */
  levels: EnrollmentLevel[]
  /** If true, teachers receive it as well. Admins always see all notifications. */
  includeTeachers: boolean
  createdAt: string
}

export function getNotifications(): NotificationRecord[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) ?? '[]') } catch { return [] }
}
function writeNotifications(n: NotificationRecord[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(n))
}
export function saveNotification(n: NotificationRecord) {
  const all = getNotifications()
  const idx = all.findIndex(x => x.id === n.id)
  if (idx >= 0) all[idx] = n
  else all.unshift(n) // newest first
  writeNotifications(all)
}
export function deleteNotification(id: string) {
  writeNotifications(getNotifications().filter(n => n.id !== id))
}

/** Notifications visible to a student of `level`. */
export function notificationsForStudent(level: EnrollmentLevel): NotificationRecord[] {
  return getNotifications().filter(n => n.levels.length === 0 || n.levels.includes(level))
}
/** Notifications visible to a teacher (admin chose includeTeachers, OR teacher authored). */
export function notificationsForTeacher(teacherEmail: string): NotificationRecord[] {
  return getNotifications().filter(n => n.includeTeachers || n.authorRole === 'TEACHER' || n.authorName === teacherEmail)
}

/* ─────────────────────────────────────────────────────────────────
   Server-backed school announcements (with optional poster image)
   The legacy NotificationRecord/localStorage helpers above are kept
   for back-compat with code paths that still reference them; the
   NotificationPanel UI now uses these server-backed helpers.
   ───────────────────────────────────────────────────────────── */

export interface AnnouncementRecord {
  id: string
  title: string
  body: string
  levels: EnrollmentLevel[]
  includeTeachers: boolean
  authorRole: NotifAuthor
  authorEmail: string
  authorName: string
  /** True when there's a server-side poster image. Bytes are NOT
   *  shipped here — fetch via /announcements/{id}/poster on demand. */
  hasPoster: boolean
  posterFileName: string | null
  posterFileType: string | null
  posterFileSize: number | null
  /** When the announcement was last blasted to recipients' emails.
   *  Null if it has never been emailed. */
  emailedAt: string | null
  emailedBy: string | null
  emailedCount: number | null
  createdAt: string
}

/** Result returned by the email-blast endpoint. */
export interface AnnouncementEmailResult {
  ok: boolean
  sent: number
  failed: number
  errors: Array<{ email: string; error: string }>
  emailedAt?: string
  emailedBy?: string
  note?: string
  /** Per-grade-level and per-role recipient counts. Surfaces who
   *  actually got the blast so the admin can verify the level filter. */
  recipientBreakdown?: {
    byLevel: Record<string, number>
    byRole: Record<string, number>
  }
  /** The level whitelist the server enforced for this blast. */
  allowedLevels?: string[]
  /** Number of DB-returned rows the defensive secondary filter dropped.
   *  Should always be 0 in normal operation. */
  droppedByLevel?: number
}

/** Pull the full list visible to the caller — server applies the
 *  role-based filter; the client just renders what comes back. */
export async function listAnnouncements(): Promise<AnnouncementRecord[]> {
  if (typeof window === 'undefined') return []
  if (!getToken()) return []
  try {
    const { announcements } = await backendJson<{ announcements: AnnouncementRecord[] }>(
      '/api/public/class-portal/announcements',
    )
    return announcements
  } catch (e) {
    console.warn('[listAnnouncements]', e)
    return []
  }
}

/** Create one. `poster` is the optional File picked in the composer. */
export async function createAnnouncement(args: {
  title: string
  body: string
  levels: EnrollmentLevel[]
  includeTeachers: boolean
  authorName: string
  poster?: File | null
}): Promise<AnnouncementRecord | null> {
  if (typeof window === 'undefined') return null
  if (!getToken()) return null
  try {
    const fd = new FormData()
    fd.append('title', args.title)
    fd.append('body', args.body)
    fd.append('levels', JSON.stringify(args.levels))
    fd.append('includeTeachers', args.includeTeachers ? 'true' : 'false')
    fd.append('authorName', args.authorName)
    if (args.poster) fd.append('poster', args.poster)
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/announcements`, {
      method: 'POST', body: fd,
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) {
      let body = ''
      try { body = await res.text() } catch { /* ignore */ }
      console.warn(`[createAnnouncement] ${res.status} ${body.slice(0, 200)}`)
      return null
    }
    const j = await res.json() as { announcement: AnnouncementRecord }
    return j.announcement
  } catch (e) {
    console.warn('[createAnnouncement]', e)
    return null
  }
}

export async function deleteAnnouncementServer(id: string): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!getToken()) return false
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/announcements/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    return res.ok
  } catch (e) {
    console.warn('[deleteAnnouncementServer]', e)
    return false
  }
}

/**
 * Trigger the server-side blast that emails this announcement to every
 * recipient (students in target levels + optionally teachers, scoped by
 * branch for FRONTDESK). Returns the {sent, failed} summary so the UI
 * can show how it went.
 */
export async function emailAnnouncement(id: string): Promise<AnnouncementEmailResult | null> {
  if (typeof window === 'undefined') return null
  if (!getToken()) return null
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/announcements/${encodeURIComponent(id)}/email`, {
      method: 'POST',
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) {
      let body = ''
      try { body = await res.text() } catch { /* ignore */ }
      console.warn(`[emailAnnouncement] ${res.status} ${body.slice(0, 200)}`)
      return null
    }
    return await res.json() as AnnouncementEmailResult
  } catch (e) {
    console.warn('[emailAnnouncement]', e)
    return null
  }
}

/** Fetch a poster image blob for inline display. Returns null if the
 *  announcement has no poster (HTTP 404) or any other failure. */
export async function fetchAnnouncementPosterBlob(id: string): Promise<Blob | null> {
  if (typeof window === 'undefined') return null
  if (!getToken()) return null
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/announcements/${encodeURIComponent(id)}/poster`, {
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) return null
    return await res.blob()
  } catch { return null }
}

/* ─────────────────────────────────────────────────────────────────
   Grades — per-student quarterly averages + proof doc reference
   ───────────────────────────────────────────────────────────── */

const GRADES_KEY = 'scei_class_grades_v1'

export interface GradeRecord {
  studentId: string
  q1?: string
  q2?: string
  q3?: string
  q4?: string
  yearAvg?: string
  /** Reference to a file in the student-files IndexedDB store. */
  proofFileId?: string
  proofFileName?: string
  proofFileType?: string
  proofFileSize?: number
  teacherEmail?: string
  updatedAt: string
}

export function getGrades(): Record<string, GradeRecord> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(GRADES_KEY) ?? '{}') } catch { return {} }
}
function writeGrades(g: Record<string, GradeRecord>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(GRADES_KEY, JSON.stringify(g))
}
export function getGradeForStudent(studentId: string): GradeRecord | null {
  return getGrades()[studentId] ?? null
}
export function saveGrade(g: GradeRecord) {
  const all = getGrades()
  all[g.studentId] = { ...g, updatedAt: new Date().toISOString() }
  writeGrades(all)
}

/* ─────────────────────────────────────────────────────────────────
   Classes (Phase 1) — teacher-owned class sections with roster +
   weekly schedule + cover photo. Lessons / tests / projects /
   activities land in later phases.
   ───────────────────────────────────────────────────────────── */

export type ClassDay = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'

export const CLASS_DAY_OPTIONS: Array<{ value: ClassDay; label: string; short: string }> = [
  { value: 'MONDAY',    label: 'Monday',    short: 'Mon' },
  { value: 'TUESDAY',   label: 'Tuesday',   short: 'Tue' },
  { value: 'WEDNESDAY', label: 'Wednesday', short: 'Wed' },
  { value: 'THURSDAY',  label: 'Thursday',  short: 'Thu' },
  { value: 'FRIDAY',    label: 'Friday',    short: 'Fri' },
  { value: 'SATURDAY',  label: 'Saturday',  short: 'Sat' },
  { value: 'SUNDAY',    label: 'Sunday',    short: 'Sun' },
]

export interface ClassRecord {
  id: string
  branch: Branch
  level: EnrollmentLevel
  name: string
  section: string | null
  teacherId: string
  /** Server-resolved teacher display name — populated even when the
   *  caller's local users cache doesn't include teacher rows (e.g.
   *  STUDENT viewers). Falls back to the Assignments matrix on the
   *  server when the class has no explicit teacherId. Null only if
   *  the class is genuinely unassigned. */
  teacherName?: string | null
  studentIds: string[]
  scheduleDays: ClassDay[]
  scheduleStartTime: string | null
  scheduleEndTime: string | null
  hasPhoto: boolean
  photoFileName: string | null
  photoFileType: string | null
  photoFileSize: number | null
  createdAt: string
  updatedAt: string
}

/** Fetch every class the caller is allowed to see (server-scoped). */
export async function listClasses(): Promise<ClassRecord[]> {
  if (typeof window === 'undefined') return []
  if (!getToken()) return []
  try {
    const { classes } = await backendJson<{ classes: ClassRecord[] }>('/api/public/class-portal/classes')
    return classes
  } catch (e) {
    console.warn('[listClasses]', e)
    return []
  }
}

export async function createClass(args: {
  branch: Branch
  level: EnrollmentLevel
  name: string
  section?: string | null
  studentIds?: string[]
  scheduleDays?: ClassDay[]
  scheduleStartTime?: string | null
  scheduleEndTime?: string | null
}): Promise<ClassRecord | null> {
  try {
    const { class: row } = await backendJson<{ class: ClassRecord }>('/api/public/class-portal/classes', {
      method: 'POST',
      body: JSON.stringify(args),
    })
    return row
  } catch (e) {
    console.warn('[createClass]', e)
    return null
  }
}

export async function updateClass(id: string, patch: Partial<{
  name: string
  section: string | null
  level: EnrollmentLevel
  studentIds: string[]
  scheduleDays: ClassDay[]
  scheduleStartTime: string | null
  scheduleEndTime: string | null
}>): Promise<ClassRecord | null> {
  try {
    const { class: row } = await backendJson<{ class: ClassRecord }>(`/api/public/class-portal/classes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    return row
  } catch (e) {
    console.warn('[updateClass]', e)
    return null
  }
}

export async function deleteClass(id: string): Promise<boolean> {
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/classes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    return res.ok
  } catch (e) {
    console.warn('[deleteClass]', e)
    return false
  }
}

export async function uploadClassPhoto(id: string, file: File): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!getToken()) return false
  try {
    const fd = new FormData()
    fd.append('file', file)
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/classes/${encodeURIComponent(id)}/photo`, {
      method: 'PUT',
      body: fd,
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    return res.ok
  } catch (e) {
    console.warn('[uploadClassPhoto]', e)
    return false
  }
}

/** Build an auth'd URL the <img> tag can use for the class photo. */
export function classPhotoUrl(id: string): string {
  // The browser <img> tag can't set custom Authorization headers, so we
  // can't include the JWT inline. Instead callers should fetch the bytes
  // via fetchClassPhotoBlob() and create an object URL. This helper just
  // returns the canonical URL for non-auth contexts.
  return `${backendOrigin()}/api/public/class-portal/classes/${encodeURIComponent(id)}/photo`
}

export async function fetchClassPhotoBlob(id: string): Promise<Blob | null> {
  if (typeof window === 'undefined') return null
  if (!getToken()) return null
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/classes/${encodeURIComponent(id)}/photo`, {
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) return null
    return await res.blob()
  } catch (e) {
    console.warn('[fetchClassPhotoBlob]', e)
    return null
  }
}

/* ─────────────────────────────────────────────────────────────────
   Lessons (Phase 2) — day's lessons inside a Class.
   ───────────────────────────────────────────────────────────── */

export type AttendanceStatus = 'PRESENT' | 'ABSENT'

export interface LessonRecord {
  id: string
  classId: string
  lessonDate: string
  title: string
  description: string | null
  attendance: Record<string, AttendanceStatus>
  hasStudentOutput: boolean
  gradeTotal: number | null
  grades: Record<string, { score: number; makeupDate?: string }>
  createdAt: string
  updatedAt: string
}

export interface LessonAttachmentMeta {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  createdAt: string
}

export interface LessonOutputMeta {
  id: string
  studentId: string
  fileName: string
  fileType: string
  fileSize: number
  makeupDate: string | null
  updatedAt: string
}

export async function listLessons(classId: string): Promise<LessonRecord[]> {
  if (typeof window === 'undefined') return []
  if (!getToken()) return []
  try {
    const { lessons } = await backendJson<{ lessons: LessonRecord[] }>(`/api/public/class-portal/classes/${encodeURIComponent(classId)}/lessons`)
    return lessons
  } catch (e) {
    console.warn('[listLessons]', e); return []
  }
}

export async function fetchLessonDetail(lessonId: string): Promise<{
  lesson: LessonRecord
  attachments: LessonAttachmentMeta[]
  outputs: LessonOutputMeta[]
} | null> {
  try {
    return await backendJson<{ lesson: LessonRecord; attachments: LessonAttachmentMeta[]; outputs: LessonOutputMeta[] }>(
      `/api/public/class-portal/lessons/${encodeURIComponent(lessonId)}`,
    )
  } catch (e) {
    console.warn('[fetchLessonDetail]', e); return null
  }
}

export async function createLesson(classId: string, args: {
  lessonDate: string
  title: string
  description?: string | null
  attendance?: Record<string, AttendanceStatus>
  hasStudentOutput?: boolean
  gradeTotal?: number | null
  grades?: Record<string, { score: number; makeupDate?: string }>
}): Promise<LessonRecord | null> {
  // We deliberately do NOT swallow the error here — backendJson throws with
  // the real server message (e.g. "Lesson date must fall on one of the class
  // scheduled days"), and the editor's `catch (e) { setErr(e.message) }` is
  // the only thing that gives the user a hint about why the save failed.
  const { lesson } = await backendJson<{ lesson: LessonRecord }>(`/api/public/class-portal/classes/${encodeURIComponent(classId)}/lessons`, {
    method: 'POST',
    body: JSON.stringify(args),
  })
  return lesson
}

export async function updateLesson(lessonId: string, patch: Partial<{
  title: string
  description: string | null
  lessonDate: string
  attendance: Record<string, AttendanceStatus>
  hasStudentOutput: boolean
  gradeTotal: number | null
  grades: Record<string, { score: number; makeupDate?: string }>
}>): Promise<LessonRecord | null> {
  // Same rationale as createLesson — let backendJson's message bubble up so
  // the editor surfaces it instead of the generic "Could not save."
  const { lesson } = await backendJson<{ lesson: LessonRecord }>(`/api/public/class-portal/lessons/${encodeURIComponent(lessonId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return lesson
}

export async function deleteLesson(lessonId: string): Promise<boolean> {
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/lessons/${encodeURIComponent(lessonId)}`, {
      method: 'DELETE',
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    return res.ok
  } catch { return false }
}

export async function uploadLessonAttachment(lessonId: string, file: File): Promise<LessonAttachmentMeta | null> {
  if (!getToken()) return null
  try {
    const fd = new FormData(); fd.append('file', file)
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/lessons/${encodeURIComponent(lessonId)}/attachments`, {
      method: 'POST', body: fd,
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) return null
    const j = await res.json() as { attachment: LessonAttachmentMeta }
    return j.attachment
  } catch (e) { console.warn('[uploadLessonAttachment]', e); return null }
}

export async function deleteLessonAttachment(lessonId: string, attId: string): Promise<boolean> {
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/lessons/${encodeURIComponent(lessonId)}/attachments/${encodeURIComponent(attId)}`, {
      method: 'DELETE',
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    return res.ok
  } catch { return false }
}

export async function fetchLessonAttachmentBlob(lessonId: string, attId: string): Promise<Blob | null> {
  if (!getToken()) return null
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/lessons/${encodeURIComponent(lessonId)}/attachments/${encodeURIComponent(attId)}`, {
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) return null
    return await res.blob()
  } catch { return null }
}

export async function uploadLessonOutput(lessonId: string, studentId: string, file: File, makeupDate?: string): Promise<LessonOutputMeta | null> {
  if (!getToken()) return null
  try {
    const fd = new FormData(); fd.append('file', file)
    if (makeupDate) fd.append('makeupDate', makeupDate)
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/lessons/${encodeURIComponent(lessonId)}/outputs/${encodeURIComponent(studentId)}`, {
      method: 'PUT', body: fd,
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) return null
    const j = await res.json() as { output: LessonOutputMeta }
    return j.output
  } catch (e) { console.warn('[uploadLessonOutput]', e); return null }
}

export async function fetchLessonOutputBlob(lessonId: string, studentId: string): Promise<Blob | null> {
  if (!getToken()) return null
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/lessons/${encodeURIComponent(lessonId)}/outputs/${encodeURIComponent(studentId)}`, {
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) return null
    return await res.blob()
  } catch { return null }
}

/* ─────────────────────────────────────────────────────────────────
   Tests + Projects (Phase 3)
   ───────────────────────────────────────────────────────────── */

export interface LessonTestRecord {
  id: string
  lessonId: string
  title: string
  totalPoints: number
  scores: Record<string, { score: number; makeupDate?: string }>
  createdAt: string
  updatedAt: string
}

export interface ProofMeta {
  id: string
  studentId: string
  fileName: string
  fileType: string
  fileSize: number
  updatedAt: string
}

export interface ProjectRecord {
  id: string
  classId: string
  title: string
  description: string | null
  deadline: string | null
  totalScore: number
  grades: Record<string, { score: number; makeupDate?: string }>
  createdAt: string
  updatedAt: string
}

// ── Tests ──
export async function listLessonTests(lessonId: string): Promise<LessonTestRecord[]> {
  try {
    const { tests } = await backendJson<{ tests: LessonTestRecord[] }>(`/api/public/class-portal/lessons/${encodeURIComponent(lessonId)}/tests`)
    return tests
  } catch { return [] }
}
export async function createLessonTest(lessonId: string, args: { title: string; totalPoints: number; scores?: Record<string, { score: number; makeupDate?: string }> }): Promise<LessonTestRecord | null> {
  try {
    const { test } = await backendJson<{ test: LessonTestRecord }>(`/api/public/class-portal/lessons/${encodeURIComponent(lessonId)}/tests`, { method: 'POST', body: JSON.stringify(args) })
    return test
  } catch { return null }
}
export async function updateLessonTest(testId: string, patch: Partial<{ title: string; totalPoints: number; scores: Record<string, { score: number; makeupDate?: string }> }>): Promise<LessonTestRecord | null> {
  try {
    const { test } = await backendJson<{ test: LessonTestRecord }>(`/api/public/class-portal/tests/${encodeURIComponent(testId)}`, { method: 'PATCH', body: JSON.stringify(patch) })
    return test
  } catch { return null }
}
export async function deleteLessonTest(testId: string): Promise<boolean> {
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/tests/${encodeURIComponent(testId)}`, { method: 'DELETE', headers: tok ? { authorization: `Bearer ${tok}` } : undefined })
    return res.ok
  } catch { return false }
}
export async function uploadTestProof(testId: string, studentId: string, file: File): Promise<ProofMeta | null> {
  if (!getToken()) return null
  try {
    const fd = new FormData(); fd.append('file', file)
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/tests/${encodeURIComponent(testId)}/proofs/${encodeURIComponent(studentId)}`, { method: 'PUT', body: fd, headers: tok ? { authorization: `Bearer ${tok}` } : undefined })
    if (!res.ok) return null
    const j = await res.json() as { proof: ProofMeta }
    return j.proof
  } catch { return null }
}
export async function fetchTestProofBlob(testId: string, studentId: string): Promise<Blob | null> {
  if (!getToken()) return null
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/tests/${encodeURIComponent(testId)}/proofs/${encodeURIComponent(studentId)}`, { headers: tok ? { authorization: `Bearer ${tok}` } : undefined })
    if (!res.ok) return null
    return await res.blob()
  } catch { return null }
}

// ── Projects ──
export async function listProjects(classId: string): Promise<ProjectRecord[]> {
  try {
    const { projects } = await backendJson<{ projects: ProjectRecord[] }>(`/api/public/class-portal/classes/${encodeURIComponent(classId)}/projects`)
    return projects
  } catch { return [] }
}
export async function createProject(classId: string, args: { title: string; description?: string | null; deadline?: string | null; totalScore: number; grades?: Record<string, { score: number; makeupDate?: string }> }): Promise<ProjectRecord | null> {
  try {
    const { project } = await backendJson<{ project: ProjectRecord }>(`/api/public/class-portal/classes/${encodeURIComponent(classId)}/projects`, { method: 'POST', body: JSON.stringify(args) })
    return project
  } catch { return null }
}
export async function updateProject(projectId: string, patch: Partial<{ title: string; description: string | null; deadline: string | null; totalScore: number; grades: Record<string, { score: number; makeupDate?: string }> }>): Promise<ProjectRecord | null> {
  try {
    const { project } = await backendJson<{ project: ProjectRecord }>(`/api/public/class-portal/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', body: JSON.stringify(patch) })
    return project
  } catch { return null }
}
export async function deleteProject(projectId: string): Promise<boolean> {
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE', headers: tok ? { authorization: `Bearer ${tok}` } : undefined })
    return res.ok
  } catch { return false }
}
export async function uploadProjectProof(projectId: string, studentId: string, file: File): Promise<ProofMeta | null> {
  if (!getToken()) return null
  try {
    const fd = new FormData(); fd.append('file', file)
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/projects/${encodeURIComponent(projectId)}/proofs/${encodeURIComponent(studentId)}`, { method: 'PUT', body: fd, headers: tok ? { authorization: `Bearer ${tok}` } : undefined })
    if (!res.ok) return null
    const j = await res.json() as { proof: ProofMeta }
    return j.proof
  } catch { return null }
}
export async function fetchProjectProofBlob(projectId: string, studentId: string): Promise<Blob | null> {
  if (!getToken()) return null
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/projects/${encodeURIComponent(projectId)}/proofs/${encodeURIComponent(studentId)}`, { headers: tok ? { authorization: `Bearer ${tok}` } : undefined })
    if (!res.ok) return null
    return await res.blob()
  } catch { return null }
}

/* ─────────────────────────────────────────────────────────────────
   Activities (Phase 4) — school events / field trips / IEP reviews,
   with a photo gallery uploaded by the teacher.
   ───────────────────────────────────────────────────────────── */

export interface ActivityPhotoMeta {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  createdAt: string
}

export interface ActivityRecord {
  id: string
  classId: string
  name: string
  type: string | null
  description: string | null
  fromDate: string | null
  toDate: string | null
  photos: ActivityPhotoMeta[]
  createdAt: string
  updatedAt: string
}

export const ACTIVITY_TYPE_SUGGESTIONS = [
  'School Event',
  'Field Trip',
  'IEP Review',
  'Parent-Teacher Conference',
  'Holiday',
  'Class Cancelled',
  'Other',
]

export async function listActivities(classId: string): Promise<ActivityRecord[]> {
  try {
    const { activities } = await backendJson<{ activities: ActivityRecord[] }>(`/api/public/class-portal/classes/${encodeURIComponent(classId)}/activities`)
    return activities
  } catch { return [] }
}

export async function createActivity(classId: string, args: {
  name: string
  type?: string | null
  description?: string | null
  fromDate?: string | null
  toDate?: string | null
}): Promise<ActivityRecord | null> {
  try {
    const { activity } = await backendJson<{ activity: ActivityRecord }>(`/api/public/class-portal/classes/${encodeURIComponent(classId)}/activities`, {
      method: 'POST',
      body: JSON.stringify(args),
    })
    return activity
  } catch { return null }
}

export async function updateActivity(activityId: string, patch: Partial<{
  name: string
  type: string | null
  description: string | null
  fromDate: string | null
  toDate: string | null
}>): Promise<ActivityRecord | null> {
  try {
    const { activity } = await backendJson<{ activity: ActivityRecord }>(`/api/public/class-portal/activities/${encodeURIComponent(activityId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    return activity
  } catch { return null }
}

export async function deleteActivity(activityId: string): Promise<boolean> {
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/activities/${encodeURIComponent(activityId)}`, {
      method: 'DELETE',
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    return res.ok
  } catch { return false }
}

export async function uploadActivityPhoto(activityId: string, file: File): Promise<ActivityPhotoMeta | null> {
  if (!getToken()) {
    console.warn('[uploadActivityPhoto] no token — user not signed in')
    return null
  }
  try {
    const fd = new FormData(); fd.append('file', file)
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/activities/${encodeURIComponent(activityId)}/photos`, {
      method: 'POST', body: fd,
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) {
      // Log the actual server response so a teacher reporting "the
      // button does nothing" has a real error message in the console.
      // 403 = canEditClass denied; 413 = file too big; 500 = server.
      let body = ''
      try { body = await res.text() } catch { /* ignore */ }
      console.warn(`[uploadActivityPhoto] ${res.status} ${res.statusText} → ${body.slice(0, 200)}`)
      return null
    }
    const j = await res.json() as { photo: ActivityPhotoMeta }
    return j.photo
  } catch (e) {
    console.warn('[uploadActivityPhoto] network error', e)
    return null
  }
}

export async function deleteActivityPhoto(activityId: string, photoId: string): Promise<boolean> {
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/activities/${encodeURIComponent(activityId)}/photos/${encodeURIComponent(photoId)}`, {
      method: 'DELETE',
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    return res.ok
  } catch { return false }
}

export async function fetchActivityPhotoBlob(activityId: string, photoId: string): Promise<Blob | null> {
  if (!getToken()) return null
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/activities/${encodeURIComponent(activityId)}/photos/${encodeURIComponent(photoId)}`, {
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) return null
    return await res.blob()
  } catch { return null }
}

/* ─────────────────────────────────────────────────────────────────
   Curriculum templates — uploaded per grade level
   ───────────────────────────────────────────────────────────── */

const CURRICULUM_KEY = 'scei_class_curriculum_v1'

/** One file attached to a curriculum entry — either the PDF or the editable Word version. */
export interface CurriculumFile {
  fileId: string          // ref to large-file (IndexedDB) store
  fileName: string
  fileType: string
  fileSize: number
}

export interface CurriculumRecord {
  id: string
  level: EnrollmentLevel
  title: string
  /** Optional PDF version. */
  pdf?: CurriculumFile
  /** Optional Word (.doc / .docx) version of the same document. */
  doc?: CurriculumFile
  /** Optional Excel (.xlsx / .xls) version of the same document — for
   *  spreadsheet-style curriculum templates (grade trackers, schedules,
   *  scope-and-sequence sheets, etc.). */
  xls?: CurriculumFile
  uploadedBy: string      // "admin" or teacher email
  uploadedAt: string
  /** Legacy single-file fields — read-only back-compat for records uploaded
   *  before the PDF/DOC split. Surfaced in the list as a single download. */
  fileId?: string
  fileName?: string
  fileType?: string
  fileSize?: number
}

export function getCurriculum(): CurriculumRecord[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(CURRICULUM_KEY) ?? '[]') } catch { return [] }
}
function writeCurriculum(c: CurriculumRecord[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(CURRICULUM_KEY, JSON.stringify(c))
}
export function curriculumForLevel(level: EnrollmentLevel): CurriculumRecord[] {
  return getCurriculum().filter(c => c.level === level)
}

/**
 * Fetch every curriculum entry from the server (any device sees the same
 * list — fixes the prior localStorage-only state where teachers couldn't
 * see admin uploads). Falls back to the local cache if the network call
 * fails so we don't blank out the panel on transient errors.
 */
export async function hydrateCurriculumFromServer(): Promise<CurriculumRecord[]> {
  if (typeof window === 'undefined') return getCurriculum()
  if (!getToken()) return getCurriculum()
  try {
    const { items } = await backendJson<{
      items: Array<{
        id: string; level: string; title: string
        pdf: { fileName: string; fileType: string; fileSize: number } | null
        doc: { fileName: string; fileType: string; fileSize: number } | null
        xls: { fileName: string; fileType: string; fileSize: number } | null
        uploadedBy: string; uploadedAt: string
      }>
    }>('/api/public/class-portal/curriculum')
    const rows: CurriculumRecord[] = items.map(r => {
      const rec: CurriculumRecord = {
        id: r.id,
        level: r.level as EnrollmentLevel,
        title: r.title,
        uploadedBy: r.uploadedBy,
        uploadedAt: r.uploadedAt,
      }
      // fileId encodes "<id>:<variant>" — the panel passes it through to
      // openServerCurriculumFile() which fetches the bytes from the API.
      if (r.pdf) rec.pdf = { fileId: `${r.id}:pdf`, fileName: r.pdf.fileName, fileType: r.pdf.fileType, fileSize: r.pdf.fileSize }
      if (r.doc) rec.doc = { fileId: `${r.id}:doc`, fileName: r.doc.fileName, fileType: r.doc.fileType, fileSize: r.doc.fileSize }
      if (r.xls) rec.xls = { fileId: `${r.id}:xls`, fileName: r.xls.fileName, fileType: r.xls.fileType, fileSize: r.xls.fileSize }
      return rec
    })
    writeCurriculum(rows)
    return rows
  } catch (e) {
    console.warn('[hydrateCurriculumFromServer]', e)
    return getCurriculum()
  }
}

/**
 * Upsert a curriculum entry on the server. Caller passes raw File objects;
 * we package them as multipart and stream them up. Returns true on success.
 */
export async function uploadCurriculum(
  args: { id: string; level: EnrollmentLevel; title: string; pdf?: File; doc?: File; xls?: File },
): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!getToken()) return false
  try {
    const fd = new FormData()
    fd.append('id', args.id)
    fd.append('level', args.level)
    fd.append('title', args.title)
    if (args.pdf) fd.append('pdfFile', args.pdf)
    if (args.doc) fd.append('docFile', args.doc)
    if (args.xls) fd.append('xlsFile', args.xls)
    const tok = getToken()
    const res = await fetch(backendOrigin() + '/api/public/class-portal/curriculum', {
      method: 'POST',
      body: fd,
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      console.warn('[uploadCurriculum] failed:', res.status, j)
      return false
    }
    return true
  } catch (e) {
    console.warn('[uploadCurriculum] error:', e)
    return false
  }
}

/** Delete a curriculum row on the server. Returns true on success. */
export async function deleteCurriculumServer(id: string): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!getToken()) return false
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/curriculum/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) return false
    writeCurriculum(getCurriculum().filter(c => c.id !== id))
    return true
  } catch (e) {
    console.warn('[deleteCurriculumServer] error:', e)
    return false
  }
}

/**
 * One-shot migration: find any localStorage curriculum entries that were
 * uploaded *before* the server-backed library shipped (their per-variant
 * fileIds look like `curr_pdf_XXX` instead of the new `<id>:pdf` shape),
 * read the file bytes back out of IndexedDB, and upload them to the server
 * under the same id. Safe to call repeatedly — already-migrated rows skip
 * because their fileIds contain a colon. Returns the count of rows pushed.
 */
export async function migrateLocalCurriculumToServer(): Promise<number> {
  if (typeof window === 'undefined') return 0
  if (!getToken()) return 0
  const local = getCurriculum()
  // "Legacy" record has at least one variant whose fileId is an IndexedDB key
  // (no colon) instead of the new "<id>:variant" handle.
  const isIdbHandle = (id?: string) => !!id && !id.includes(':')
  const legacy = local.filter(c =>
    isIdbHandle(c.pdf?.fileId) || isIdbHandle(c.doc?.fileId) || isIdbHandle(c.xls?.fileId) || isIdbHandle(c.fileId),
  )
  if (legacy.length === 0) return 0

  let migrated = 0
  for (const c of legacy) {
    const files: { pdf?: File; doc?: File; xls?: File } = {}
    async function pull(meta?: { fileId: string; fileName: string; fileType: string }) {
      if (!meta?.fileId || !isIdbHandle(meta.fileId)) return undefined
      const blob = await getFile(meta.fileId)
      if (!blob) return undefined
      return new File([blob], meta.fileName, { type: meta.fileType || blob.type || 'application/octet-stream' })
    }
    files.pdf = await pull(c.pdf)
    files.doc = await pull(c.doc)
    files.xls = await pull(c.xls)
    // Legacy single-file records (no per-variant fields) — push whatever they
    // had under .fileId as PDF (best guess for a generic upload).
    if (!files.pdf && !files.doc && !files.xls && isIdbHandle(c.fileId) && c.fileName) {
      const blob = await getFile(c.fileId!)
      if (blob) files.pdf = new File([blob], c.fileName, { type: c.fileType || blob.type || 'application/octet-stream' })
    }
    if (!files.pdf && !files.doc && !files.xls) continue
    const ok = await uploadCurriculum({
      id: c.id,
      level: c.level,
      title: c.title,
      ...files,
    })
    if (ok) migrated++
  }
  return migrated
}

/**
 * Fetch the bytes for a curriculum variant. fileId is the
 * "<curriculumId>:<variant>" handle that hydrateCurriculumFromServer
 * encodes; we split it back here.
 */
export async function fetchCurriculumFileBlob(fileId: string): Promise<Blob | null> {
  if (typeof window === 'undefined') return null
  if (!getToken()) return null
  const [id, variant] = fileId.split(':')
  if (!id || (variant !== 'pdf' && variant !== 'doc' && variant !== 'xls')) return null
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/curriculum/${encodeURIComponent(id)}/file/${variant}`, {
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) return null
    return await res.blob()
  } catch (e) {
    console.warn('[fetchCurriculumFileBlob] error:', e)
    return null
  }
}

/* ─────────────────────────────────────────────────────────────────
   Templates — free-form files that admin/teacher can drop in (lesson
   plan template, sample IEP, etc.). Each row carries an optional PDF
   and optional Word version of the same document.
   ───────────────────────────────────────────────────────────── */

const TEMPLATES_KEY = 'scei_class_templates_v1'

export interface TemplateRecord {
  id: string
  title: string
  pdf?: CurriculumFile
  doc?: CurriculumFile
  uploadedBy: string
  uploadedAt: string
}

export function getTemplates(): TemplateRecord[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? '[]') } catch { return [] }
}
function writeTemplates(rows: TemplateRecord[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(rows))
}

/** Fetch the template library from the server. Mirrors curriculum hydration. */
export async function hydrateTemplatesFromServer(): Promise<TemplateRecord[]> {
  if (typeof window === 'undefined') return getTemplates()
  if (!getToken()) return getTemplates()
  try {
    const { items } = await backendJson<{
      items: Array<{
        id: string; title: string
        pdf: { fileName: string; fileType: string; fileSize: number } | null
        doc: { fileName: string; fileType: string; fileSize: number } | null
        uploadedBy: string; uploadedAt: string
      }>
    }>('/api/public/class-portal/templates')
    const rows: TemplateRecord[] = items.map(r => {
      const rec: TemplateRecord = {
        id: r.id,
        title: r.title,
        uploadedBy: r.uploadedBy,
        uploadedAt: r.uploadedAt,
      }
      if (r.pdf) rec.pdf = { fileId: `${r.id}:pdf`, fileName: r.pdf.fileName, fileType: r.pdf.fileType, fileSize: r.pdf.fileSize }
      if (r.doc) rec.doc = { fileId: `${r.id}:doc`, fileName: r.doc.fileName, fileType: r.doc.fileType, fileSize: r.doc.fileSize }
      return rec
    })
    writeTemplates(rows)
    return rows
  } catch (e) {
    console.warn('[hydrateTemplatesFromServer]', e)
    return getTemplates()
  }
}

export async function uploadTemplate(
  args: { id: string; title: string; pdf?: File; doc?: File },
): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!getToken()) return false
  try {
    const fd = new FormData()
    fd.append('id', args.id)
    fd.append('title', args.title)
    if (args.pdf) fd.append('pdfFile', args.pdf)
    if (args.doc) fd.append('docFile', args.doc)
    const tok = getToken()
    const res = await fetch(backendOrigin() + '/api/public/class-portal/templates', {
      method: 'POST',
      body: fd,
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      console.warn('[uploadTemplate] failed:', res.status, j)
      return false
    }
    return true
  } catch (e) {
    console.warn('[uploadTemplate] error:', e)
    return false
  }
}

export async function deleteTemplateServer(id: string): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!getToken()) return false
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) return false
    writeTemplates(getTemplates().filter(t => t.id !== id))
    return true
  } catch (e) {
    console.warn('[deleteTemplateServer] error:', e)
    return false
  }
}

/**
 * Same one-shot migration as migrateLocalCurriculumToServer but for the
 * template library. Pushes legacy IndexedDB-backed records to the server.
 */
export async function migrateLocalTemplatesToServer(): Promise<number> {
  if (typeof window === 'undefined') return 0
  if (!getToken()) return 0
  const local = getTemplates()
  const isIdbHandle = (id?: string) => !!id && !id.includes(':')
  const legacy = local.filter(t => isIdbHandle(t.pdf?.fileId) || isIdbHandle(t.doc?.fileId))
  if (legacy.length === 0) return 0

  let migrated = 0
  for (const t of legacy) {
    const files: { pdf?: File; doc?: File } = {}
    async function pull(meta?: { fileId: string; fileName: string; fileType: string }) {
      if (!meta?.fileId || !isIdbHandle(meta.fileId)) return undefined
      const blob = await getFile(meta.fileId)
      if (!blob) return undefined
      return new File([blob], meta.fileName, { type: meta.fileType || blob.type || 'application/octet-stream' })
    }
    files.pdf = await pull(t.pdf)
    files.doc = await pull(t.doc)
    if (!files.pdf && !files.doc) continue
    const ok = await uploadTemplate({ id: t.id, title: t.title, ...files })
    if (ok) migrated++
  }
  return migrated
}

export async function fetchTemplateFileBlob(fileId: string): Promise<Blob | null> {
  if (typeof window === 'undefined') return null
  if (!getToken()) return null
  const [id, variant] = fileId.split(':')
  if (!id || (variant !== 'pdf' && variant !== 'doc')) return null
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/templates/${encodeURIComponent(id)}/file/${variant}`, {
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) return null
    return await res.blob()
  } catch (e) {
    console.warn('[fetchTemplateFileBlob] error:', e)
    return null
  }
}

/* ─────────────────────────────────────────────────────────────────
   Teacher ↔ (branch, grade-level) assignments — admin-managed.
   Backed by the marketing API; localStorage holds a write-through cache
   so existing sync helpers keep working.
   ───────────────────────────────────────────────────────────── */

const ASSIGNMENTS_KEY = 'scei_class_assignments_v2'

export interface TeacherAssignment {
  teacherId: string
  branch: Branch
  level: EnrollmentLevel
}

export function getAssignments(): TeacherAssignment[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(ASSIGNMENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as TeacherAssignment[]
  } catch { return [] }
}

function writeAssignments(a: TeacherAssignment[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(a))
}

/** Pull the full assignment list from the API into the local cache. */
export async function hydrateAssignments(): Promise<TeacherAssignment[]> {
  if (typeof window === 'undefined') return []
  if (!getToken()) return getAssignments()
  try {
    const { assignments } = await backendJson<{ assignments: TeacherAssignment[] }>('/api/public/class-portal/assignments')
    writeAssignments(assignments)
    return assignments
  } catch { return getAssignments() }
}

/** Admin only: replace the full assignment set on the server + cache. */
export async function saveAssignments(next: TeacherAssignment[]): Promise<TeacherAssignment[]> {
  const { assignments } = await backendJson<{ assignments: TeacherAssignment[] }>('/api/public/class-portal/assignments', {
    method: 'PUT',
    body: JSON.stringify({ assignments: next }),
  })
  writeAssignments(assignments)
  return assignments
}

/** True if the teacher is assigned to (branch, level). */
export function teacherHandles(teacherId: string, branch: Branch, level: EnrollmentLevel): boolean {
  return getAssignments().some(a => a.teacherId === teacherId && a.branch === branch && a.level === level)
}

/** All (branch, level) pairs the teacher is assigned to. */
export function teacherAssignedPairs(teacherId: string): Array<{ branch: Branch; level: EnrollmentLevel }> {
  return getAssignments()
    .filter(a => a.teacherId === teacherId)
    .map(a => ({ branch: a.branch, level: a.level }))
}

/** All unique grade levels the teacher covers, across branches. Kept for back-compat. */
export function teacherAssignedLevels(teacherId: string): EnrollmentLevel[] {
  return Array.from(new Set(teacherAssignedPairs(teacherId).map(p => p.level)))
}

/** All unique branches the teacher covers. */
export function teacherAssignedBranches(teacherId: string): Branch[] {
  return Array.from(new Set(teacherAssignedPairs(teacherId).map(p => p.branch)))
}

/* ─────────────────────────────────────────────────────────────────
   Per-grade-level enabled flag — admin can turn off any level so new
   enrollees can no longer pick it. Cached in localStorage so the
   landing/enroll tiles can render the disabled state synchronously.
   ───────────────────────────────────────────────────────────── */

const LEVEL_STATUS_KEY = 'scei_class_level_status_v1'

export interface LevelStatus {
  level: EnrollmentLevel
  enabled: boolean
  updatedAt: string | null
  updatedBy: string | null
}

const ALL_LEVELS_ARR: EnrollmentLevel[] = ['NURSERY', 'KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12']

function defaultLevelStatus(): LevelStatus[] {
  return ALL_LEVELS_ARR.map(level => ({ level, enabled: true, updatedAt: null, updatedBy: null }))
}

export function getLevelStatus(): LevelStatus[] {
  if (typeof window === 'undefined') return defaultLevelStatus()
  try {
    const raw = localStorage.getItem(LEVEL_STATUS_KEY)
    if (!raw) return defaultLevelStatus()
    const parsed = JSON.parse(raw) as LevelStatus[]
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultLevelStatus()
    return parsed
  } catch { return defaultLevelStatus() }
}

function writeLevelStatus(rows: LevelStatus[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(LEVEL_STATUS_KEY, JSON.stringify(rows))
}

/** Pull the canonical status list from the API. Falls back to cache on error.
 *  Unauthenticated callers (landing page before sign-in) also fall back to
 *  cache — the cache is populated on every authenticated page load. */
export async function hydrateLevelStatus(): Promise<LevelStatus[]> {
  if (typeof window === 'undefined') return defaultLevelStatus()
  if (!getToken()) return getLevelStatus()
  try {
    const { levels } = await backendJson<{ levels: LevelStatus[] }>('/api/public/class-portal/levels')
    writeLevelStatus(levels)
    return levels
  } catch { return getLevelStatus() }
}

/** Admin only: PUT the full status set to the API + cache. */
export async function saveLevelStatus(next: LevelStatus[]): Promise<LevelStatus[]> {
  const { levels } = await backendJson<{ levels: LevelStatus[] }>('/api/public/class-portal/levels', {
    method: 'PUT',
    body: JSON.stringify({ levels: next.map(l => ({ level: l.level, enabled: l.enabled })) }),
  })
  writeLevelStatus(levels)
  return levels
}

/** Convenience: returns true when the level is enabled (or unset → defaults to enabled). */
export function isLevelEnabled(level: EnrollmentLevel): boolean {
  const row = getLevelStatus().find(r => r.level === level)
  return !row || row.enabled
}

/* ─────────────────────────────────────────────────────────────────
   Fee schedule — admin-editable, one row per branch. Persists to the
   marketing API; localStorage holds a write-through cache so the pay
   page can render its summary synchronously while the freshest values
   stream in over the wire.
   ───────────────────────────────────────────────────────────── */

const FEES_KEY = 'scei_class_fees_v1'

export interface FeeExtraItem {
  label: string
  amountCentavos: number
  notes?: string
}

export interface FeeSchedule {
  branch: Branch
  tuitionAnnualCentavos: number
  tuitionBiannualCentavos: number
  tuitionMonthlyCentavos: number
  miscAnnualCentavos: number
  miscBiannualCentavos: number
  miscMonthlyCentavos: number
  extraItems: FeeExtraItem[]
  updatedAt: string | null
  updatedBy: string | null
}

const ALL_BRANCHES_ARR: Branch[] = ['EAST', 'GREENHILLS']

/** Fall-back values used when no row exists yet so the pay page is never
 *  empty. These match the historical hardcoded constants. Centavos = PHP × 100. */
export const DEFAULT_FEE_VALUES = {
  tuitionAnnualCentavos:   80_000_00,
  tuitionBiannualCentavos: 45_000_00,
  tuitionMonthlyCentavos:   9_500_00,
  miscAnnualCentavos:       5_000_00,
  miscBiannualCentavos:     2_500_00,
  miscMonthlyCentavos:         500_00,
}

function defaultFeeForBranch(branch: Branch): FeeSchedule {
  return {
    branch,
    ...DEFAULT_FEE_VALUES,
    extraItems: [],
    updatedAt: null,
    updatedBy: null,
  }
}

function defaultFees(): FeeSchedule[] {
  return ALL_BRANCHES_ARR.map(defaultFeeForBranch)
}

export function getFees(): FeeSchedule[] {
  if (typeof window === 'undefined') return defaultFees()
  try {
    const raw = localStorage.getItem(FEES_KEY)
    if (!raw) return defaultFees()
    const parsed = JSON.parse(raw) as FeeSchedule[]
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultFees()
    // Ensure every branch has a row, even if the cache is partial.
    return ALL_BRANCHES_ARR.map(b => parsed.find(p => p.branch === b) ?? defaultFeeForBranch(b))
  } catch { return defaultFees() }
}

function writeFees(rows: FeeSchedule[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(FEES_KEY, JSON.stringify(rows))
}

/** Pull the canonical fee list from the API. Falls back to cache on error.
 *  Unauthenticated callers fall back to cache — the cache is populated on
 *  every authenticated page load. */
export async function hydrateFees(): Promise<FeeSchedule[]> {
  if (typeof window === 'undefined') return defaultFees()
  if (!getToken()) return getFees()
  try {
    const { fees } = await backendJson<{ fees: FeeSchedule[] }>('/api/public/class-portal/fees')
    const merged = ALL_BRANCHES_ARR.map(b => fees.find(f => f.branch === b) ?? defaultFeeForBranch(b))
    writeFees(merged)
    return merged
  } catch { return getFees() }
}

/** Admin only: PUT one or more branch schedules to the API + cache. */
export async function saveFees(next: FeeSchedule[]): Promise<FeeSchedule[]> {
  const { fees } = await backendJson<{ fees: FeeSchedule[] }>('/api/public/class-portal/fees', {
    method: 'PUT',
    body: JSON.stringify({ fees: next }),
  })
  const merged = ALL_BRANCHES_ARR.map(b => fees.find(f => f.branch === b) ?? defaultFeeForBranch(b))
  writeFees(merged)
  return merged
}

/** Lookup the schedule for a specific branch. Returns the default if a
 *  branch row hasn't been set yet so the pay page is never empty. */
export function getFeeFor(branch: Branch | undefined | null): FeeSchedule {
  if (!branch) return defaultFeeForBranch('EAST')
  return getFees().find(f => f.branch === branch) ?? defaultFeeForBranch(branch)
}

/* ─────────────────────────────────────────────────────────────────
   Tuition discount vouchers — admin-editable, global (not per-branch).
   Admin sets code / % discount / valid-until in the Fees tab; parents
   type a code on /pay and the tuition is reduced. Validation is done
   server-side so codes aren't enumerable by students.
   ───────────────────────────────────────────────────────────── */

const VOUCHERS_KEY = 'scei_class_vouchers_v1'

export interface Voucher {
  id?: string
  code: string
  discountPercent: number
  /** ISO datetime — last moment the code applies (end of the chosen day). */
  validUntil: string
  enabled: boolean
  updatedAt?: string | null
  updatedBy?: string | null
  /** Set when the voucher was minted for a specific early-bird student. */
  dedicatedStudentId?: string | null
  /** Hydrated by the admin GET so the vouchers panel can show "who is
   *  this for?" without an extra round-trip per row. Null for shared codes. */
  dedicatedStudent?: null | {
    id: string
    firstName: string | null
    lastName: string | null
    email: string
    branch: 'EAST' | 'GREENHILLS' | null
  }
}

export function getVouchers(): Voucher[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(VOUCHERS_KEY)
    const parsed = raw ? (JSON.parse(raw) as Voucher[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function writeVouchers(rows: Voucher[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(VOUCHERS_KEY, JSON.stringify(rows))
}

/** Admin only: pull the full voucher list for management. */
export async function hydrateVouchers(): Promise<Voucher[]> {
  if (typeof window === 'undefined') return []
  if (!getToken()) return getVouchers()
  try {
    const { vouchers } = await backendJson<{ vouchers: Voucher[] }>('/api/public/class-portal/vouchers')
    writeVouchers(vouchers)
    return vouchers
  } catch { return getVouchers() }
}

/** Admin only: replace the full voucher set. */
export async function saveVouchers(next: Voucher[]): Promise<Voucher[]> {
  const { vouchers } = await backendJson<{ vouchers: Voucher[] }>('/api/public/class-portal/vouchers', {
    method: 'PUT',
    body: JSON.stringify({ vouchers: next }),
  })
  writeVouchers(vouchers)
  return vouchers
}

export interface VoucherValidation {
  valid: boolean
  code?: string
  discountPercent?: number
  validUntil?: string
  reason?: string
}

/** Validate a single code against the server (authoritative on expiry). */
export async function validateVoucher(code: string): Promise<VoucherValidation> {
  const trimmed = code.trim()
  if (!trimmed) return { valid: false, reason: 'Enter a voucher code.' }
  try {
    return await backendJson<VoucherValidation>('/api/public/class-portal/vouchers/validate', {
      method: 'POST',
      body: JSON.stringify({ code: trimmed }),
    })
  } catch (e) {
    return { valid: false, reason: (e as Error).message || 'Could not check that code. Please try again.' }
  }
}

/* ─────────────────────────────────────────────────────────────────
   Student headshot + uploaded-file blobs (IndexedDB)
   localStorage caps at ~5MB which is too small for real files.
   IndexedDB holds the binary; the StoredUser keeps just references.
   ───────────────────────────────────────────────────────────── */

const HEADSHOT_KEY = 'scei_class_headshots_v1'   // small metadata only

export interface HeadshotMeta {
  studentId: string
  dataUrl: string        // base64-encoded image — capped to ~500KB
  uploadedAt: string
  /**
   * Where this headshot came from. '1x1' means it was synced from the
   * parent-uploaded enrollment photo (auto, can be replaced if the
   * server has a newer version). 'manual' means a teacher/admin/student
   * uploaded it directly via HeadshotEditor — never overwrite those.
   * Older cached entries are undefined; treat them as '1x1' so they
   * stay in sync with the server.
   */
  source?: '1x1' | 'manual'
}

export function getHeadshots(): Record<string, HeadshotMeta> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(HEADSHOT_KEY) ?? '{}') } catch { return {} }
}
export function getHeadshotFor(studentId: string): HeadshotMeta | null {
  return getHeadshots()[studentId] ?? null
}
export function saveHeadshot(meta: HeadshotMeta) {
  if (typeof window === 'undefined') return
  const all = getHeadshots()
  all[meta.studentId] = meta
  localStorage.setItem(HEADSHOT_KEY, JSON.stringify(all))
}

/* ─────────────────────────────────────────────────────────────────
   Generic blob store (IndexedDB) for documents + curriculum
   ───────────────────────────────────────────────────────────── */

const DB_NAME = 'scei_class_files_v1'
const DB_STORE = 'files'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putFile(id: string, file: File): Promise<void> {
  if (typeof window === 'undefined') return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(file, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function getFile(id: string): Promise<Blob | null> {
  if (typeof window === 'undefined') return null
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly')
    const req = tx.objectStore(DB_STORE).get(id)
    req.onsuccess = () => { db.close(); resolve((req.result as Blob | undefined) ?? null) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

/**
 * Persist a file to the marketing-app blob store under (studentId, docKey).
 * Called alongside putFile() so the partner-school /admission view can
 * download the same file. Best-effort — local IndexedDB stays the source
 * of truth for the parent's UI; failure here is logged but not surfaced.
 */
export async function uploadDocumentBlob(studentId: string, docKey: string, file: File): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!getToken()) return false
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('studentId', studentId)
    fd.append('docKey', docKey)
    const tok = getToken()
    const res = await fetch(backendOrigin() + '/api/public/class-portal/document-blobs', {
      method: 'POST',
      body: fd,
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      console.warn('[uploadDocumentBlob] failed:', res.status, j)
      return false
    }
    return true
  } catch (e) {
    console.warn('[uploadDocumentBlob] error:', e)
    return false
  }
}

/**
 * List the docKeys the server already has for a student. Returns null on
 * any error (e.g. legacy build where the GET endpoint isn't deployed yet),
 * so callers can fall back to "do nothing" instead of triggering a re-sync
 * storm against an unreachable backend.
 */
async function listServerDocBlobKeys(studentId: string): Promise<Set<string> | null> {
  if (typeof window === 'undefined') return null
  if (!getToken()) return null
  try {
    const tok = getToken()
    const res = await fetch(`${backendOrigin()}/api/public/class-portal/document-blobs?studentId=${encodeURIComponent(studentId)}`, {
      headers: tok ? { authorization: `Bearer ${tok}` } : undefined,
    })
    if (!res.ok) return null
    const j = await res.json() as { blobs?: Array<{ docKey: string }> }
    return new Set((j.blobs ?? []).map(b => b.docKey))
  } catch {
    return null
  }
}

/**
 * Catch-up resync: for every doc in `enrollment.documents` that the parent
 * has in their local IndexedDB, push it to the server blob store if the
 * server doesn't already have a copy. This recovers students whose docs
 * were uploaded before the server-blob feature shipped — without forcing
 * them to re-upload anything by hand.
 *
 * Safe to call repeatedly; it's a no-op once every key is in sync.
 * Best-effort: silently swallows individual file errors and returns the
 * count of successfully synced docs.
 */
export async function syncLocalDocsToServer(
  studentId: string,
  documents: Record<string, { name: string; size: number; type?: string; fileId?: string }> | undefined,
): Promise<number> {
  if (typeof window === 'undefined' || !documents) return 0
  if (!getToken()) return 0
  const serverKeys = await listServerDocBlobKeys(studentId)
  if (serverKeys === null) return 0
  let synced = 0
  for (const [docKey, meta] of Object.entries(documents)) {
    if (!meta.fileId) continue
    if (serverKeys.has(docKey)) continue
    try {
      const blob = await getFile(meta.fileId)
      if (!blob) continue
      const file = new File([blob], meta.name, { type: meta.type ?? blob.type ?? 'application/octet-stream' })
      const ok = await uploadDocumentBlob(studentId, docKey, file)
      if (ok) synced += 1
    } catch (e) {
      console.warn('[syncLocalDocsToServer] skipped', docKey, e)
    }
  }
  return synced
}

export async function deleteFile(id: string): Promise<void> {
  if (typeof window === 'undefined') return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

/** Attempt a sign-in against the marketing API. Throws on failure. */
export async function signIn(role: AuthRole, email: string, password: string): Promise<AuthSession> {
  const res = await backendJson<{
    token: string
    user: { id?: string; role: AuthRole; email: string; firstName?: string | null; branch?: Branch | null }
  }>('/api/public/class-portal/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ role, email: email.trim().toLowerCase(), password }),
  })
  setToken(res.token)
  const session: AuthSession = {
    role: res.user.role,
    email: res.user.email,
    userId: res.user.id,
    firstName: res.user.firstName ?? undefined,
    branch: res.user.branch ?? undefined,
  }
  setAuth(session)
  // Hydrate the local user cache so subsequent sync getUsers() calls have data.
  if (typeof window !== 'undefined') {
    try { await hydrateUsers() } catch { /* ignore */ }
    // STUDENT-role signins also try to push any locally-cached
    // enrollment documents up to the server. Without this, files
    // uploaded BEFORE the parent had a JWT (during the public
    // /documents enrollment step) only ever live in this device's
    // IndexedDB — the main admin opening the student profile from
    // their own laptop sees the metadata row but the View/Download
    // buttons can't pull the bytes from anywhere. Fire-and-forget;
    // the sync is idempotent and skips docs already on the server.
    if (role === 'STUDENT' && res.user.id) {
      const sid = res.user.id
      const me = getUsers().find(u => u.id === sid)
      const docs = me?.enrollment?.documents
      if (docs && Object.keys(docs).length > 0) {
        void syncLocalDocsToServer(sid, docs)
      }
    }
    // Push any local WaiverRecord rows up to the server. Fires for
    // every role (parent, teacher, admin) — whichever signer's device
    // still holds the full structured record will close the gap left
    // by waivers signed BEFORE PR #169 deployed (which never made it
    // to the server-side blob store on their own).
    void syncLocalWaiversToServer()
  }
  return session
}

/* ─────────────────────────────────────────────────────────────────
   Local password cache — bcrypt hashes are one-way, so the API can
   never return an existing password. To support the admin "see what
   I just set" workflow, we keep a per-device localStorage map of
   plaintexts for accounts the admin created or reset on this device.
   ───────────────────────────────────────────────────────────── */

const LOCAL_PWS_KEY = 'scei_class_local_pws_v1'

function readLocalPwMap(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(LOCAL_PWS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch { return {} }
}
function writeLocalPwMap(map: Record<string, string>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(LOCAL_PWS_KEY, JSON.stringify(map))
}
export function getLocalPassword(userId: string): string | null {
  return readLocalPwMap()[userId] ?? null
}
export function setLocalPassword(userId: string, password: string) {
  const map = readLocalPwMap()
  map[userId] = password
  writeLocalPwMap(map)
}
export function deleteLocalPassword(userId: string) {
  const map = readLocalPwMap()
  delete map[userId]
  writeLocalPwMap(map)
}

/** Generate a short alphanumeric password for admin-initiated resets. */
export function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  const len = 10
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length]
  return out
}

/** Clear sign-in state. */
export function signOut() {
  clearToken()
  clearAuth()
}
