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

/* ─────────────────────────────────────────────────────────────────
   Users + auth (MVP — localStorage backed)
   Backend integration: replace getUsers/addUser/etc. with real
   /api/public/students/* and /api/public/teachers/* once they
   exist, and store only an HMAC-signed session token here.
   ───────────────────────────────────────────────────────────── */

const USERS_KEY = 'scei_class_users_v1'
const AUTH_KEY = 'scei_class_auth_v1'

export type UserRole = 'STUDENT' | 'TEACHER'
export type AuthRole = UserRole | 'ADMIN'

export interface StoredUser {
  id: string
  role: UserRole
  email: string
  password: string
  firstName?: string
  lastName?: string
  level?: EnrollmentLevel
  createdAt: string
  /** Snapshot of the enrollment draft at signup (students only). */
  enrollment?: Partial<EnrollmentDraft>
}

export interface AuthSession {
  role: AuthRole
  email: string
  userId?: string
  firstName?: string
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

export function addUser(u: Omit<StoredUser, 'id' | 'createdAt'>): StoredUser {
  const existing = findUser(u.role, u.email)
  if (existing) throw new Error('A user with this email already exists for this role.')
  const newUser: StoredUser = {
    ...u,
    id: 'usr_' + Math.random().toString(36).slice(2, 10),
    createdAt: new Date().toISOString(),
  }
  writeUsers([...getUsers(), newUser])
  return newUser
}

export function updateUser(id: string, patch: Partial<Omit<StoredUser, 'id' | 'createdAt' | 'role'>>) {
  const users = getUsers()
  const idx = users.findIndex(u => u.id === id)
  if (idx < 0) throw new Error('User not found.')
  // Disallow email collisions within the same role
  if (patch.email) {
    const collision = users.find(u => u.id !== id && u.role === users[idx].role && u.email.toLowerCase() === patch.email!.toLowerCase())
    if (collision) throw new Error('Another user with this email already exists in this role.')
  }
  users[idx] = { ...users[idx], ...patch }
  writeUsers(users)
  return users[idx]
}

export function deleteUser(id: string) {
  writeUsers(getUsers().filter(u => u.id !== id))
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

/** Attempt a sign-in. Throws on failure. */
export function signIn(role: AuthRole, email: string, password: string): AuthSession {
  if (role === 'ADMIN') {
    if (email.trim().toLowerCase() !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      throw new Error('Invalid admin credentials.')
    }
    const session: AuthSession = { role: 'ADMIN', email: ADMIN_EMAIL }
    setAuth(session)
    return session
  }
  const user = findUser(role, email)
  if (!user || user.password !== password) {
    throw new Error('Email and password do not match a ' + role.toLowerCase() + ' account.')
  }
  const session: AuthSession = { role, email: user.email, userId: user.id, firstName: user.firstName }
  setAuth(session)
  return session
}
