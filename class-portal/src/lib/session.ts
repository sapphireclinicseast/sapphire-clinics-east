// Client-side enrollment draft, backed by localStorage. Persists the
// New Student → Enroll (full DepEd-style learner profile) → Documents flow
// across page navigations. Once a backend endpoint exists, wire the helpers
// in `api.ts` to it and continue to use this store for in-progress drafts.

const DRAFT_KEY = 'scei_class_draft_v1'
const SESSION_KEY = 'scei_class_session_v1'

export type EnrollmentLevel = 'KINDER' | 'GRADE_1' | 'GRADE_2' | 'GRADE_3' | 'GRADE_4' | 'GRADE_5' | 'GRADE_6' | 'GRADE_7' | 'GRADE_8' | 'GRADE_9' | 'GRADE_10'
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

import { backendJson, setToken, clearToken, getToken } from './backend'

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

/**
 * Pull the marketing-hub view of class-portal front-desk payments. Any row
 * the accounting hub cashier has marked CONVERTED flips the matching local
 * PaymentRecord from PENDING to PAID so the student sees the new status
 * without having to manually refresh.
 */
export async function hydrateFrontDeskPayments(): Promise<PaymentRecord[]> {
  if (typeof window === 'undefined') return getPayments()
  if (!getToken()) return getPayments()
  try {
    const { payments } = await backendJson<{
      payments: Array<{
        classPortalPaymentId: string
        status: 'PENDING' | 'CONVERTED' | 'VOIDED'
        convertedAt: string | null
      }>
    }>('/api/public/class-portal/frontdesk-payments')
    const byId = new Map(payments.map(p => [p.classPortalPaymentId, p]))
    const local = getPayments()
    let mutated = false
    const next = local.map(rec => {
      const remote = byId.get(rec.id)
      if (!remote) return rec
      if (remote.status === 'CONVERTED' && rec.status !== 'PAID') {
        mutated = true
        return { ...rec, status: 'PAID' as const, paidAt: remote.convertedAt ?? new Date().toISOString() }
      }
      // If the accounting hub voids/reopens the order, the remote row goes
      // back to PENDING (or VOIDED). Reflect that on the student portal:
      // PAID flips to PENDING and the paidAt timestamp is cleared.
      if ((remote.status === 'PENDING' || remote.status === 'VOIDED') && rec.status === 'PAID') {
        mutated = true
        const { paidAt: _drop, ...rest } = rec
        void _drop
        return { ...rest, status: 'PENDING' as const }
      }
      return rec
    })
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
    for (let back = 1; back <= 3; back++) {
      const mm = (m + 12 - back) % 12
      const yy = m - back < 0 ? y - 1 : y
      const period = `${monthName(mm)} ${yy}`
      const alreadyPaid = paid.some(p => p.period === period)
      if (alreadyPaid) continue
      // Only emit if today is past the 5th of that month
      const due = new Date(yy, mm, 5, 23, 59, 59)
      if (today <= due) continue
      // And skip if no record at all + not in current window (avoid spamming for never-paid students far back)
      emit({
        title: `Monthly tuition — ${period} OVERDUE`,
        body: `Monthly tuition for ${period} is past due (deadline was ${monthName(mm)} 5${yy !== y ? `, ${yy}` : ''}). Please complete payment via PayMongo as soon as possible.`,
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
export function saveCurriculum(c: CurriculumRecord) {
  const all = getCurriculum()
  const idx = all.findIndex(x => x.id === c.id)
  if (idx >= 0) all[idx] = c
  else all.unshift(c)
  writeCurriculum(all)
}
export function deleteCurriculum(id: string) {
  writeCurriculum(getCurriculum().filter(c => c.id !== id))
}
export function curriculumForLevel(level: EnrollmentLevel): CurriculumRecord[] {
  return getCurriculum().filter(c => c.level === level)
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
export function saveTemplate(t: TemplateRecord) {
  const all = getTemplates()
  const idx = all.findIndex(x => x.id === t.id)
  if (idx >= 0) all[idx] = t
  else all.unshift(t)
  writeTemplates(all)
}
export function deleteTemplate(id: string) {
  writeTemplates(getTemplates().filter(t => t.id !== id))
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

const ALL_LEVELS_ARR: EnrollmentLevel[] = ['KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10']

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
   Student headshot + uploaded-file blobs (IndexedDB)
   localStorage caps at ~5MB which is too small for real files.
   IndexedDB holds the binary; the StoredUser keeps just references.
   ───────────────────────────────────────────────────────────── */

const HEADSHOT_KEY = 'scei_class_headshots_v1'   // small metadata only

export interface HeadshotMeta {
  studentId: string
  dataUrl: string        // base64-encoded image — capped to ~500KB
  uploadedAt: string
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
