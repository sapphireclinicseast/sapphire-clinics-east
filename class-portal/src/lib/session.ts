// Client-side enrollment draft, backed by localStorage. Persists the
// New Student → Enroll (full DepEd-style learner profile) → Documents flow
// across page navigations. Once a backend endpoint exists, wire the helpers
// in `api.ts` to it and continue to use this store for in-progress drafts.

const DRAFT_KEY = 'scei_class_draft_v1'
const SESSION_KEY = 'scei_class_session_v1'

export type EnrollmentLevel = 'KINDER' | 'GRADE_1' | 'GRADE_2' | 'GRADE_3' | 'GRADE_4' | 'GRADE_5' | 'GRADE_6'
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
    case 'KINDER': return 'Kindergarten'
    case 'GRADE_1': return 'Grade 1'
    case 'GRADE_2': return 'Grade 2'
    case 'GRADE_3': return 'Grade 3'
    case 'GRADE_4': return 'Grade 4'
    case 'GRADE_5': return 'Grade 5'
    case 'GRADE_6': return 'Grade 6'
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

/**
 * Admin-only: patch a student's stored enrollment data (when the parent
 * submitted incomplete or out-of-date information).
 */
export function updateUserEnrollment(id: string, patch: Partial<EnrollmentDraft>): StoredUser {
  const users = getUsers()
  const idx = users.findIndex(u => u.id === id)
  if (idx < 0) throw new Error('User not found.')
  const u = users[idx]
  if (u.role !== 'STUDENT') throw new Error('Only student accounts have enrollment data.')
  users[idx] = { ...u, enrollment: { ...(u.enrollment ?? {}), ...patch } }
  writeUsers(users)
  return users[idx]
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
  paymongoCheckoutId?: string
  paymongoCheckoutUrl?: string
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

export interface CurriculumRecord {
  id: string
  level: EnrollmentLevel
  title: string
  fileId: string          // ref to large-file store
  fileName: string
  fileType: string
  fileSize: number
  uploadedBy: string      // "admin" or teacher email
  uploadedAt: string
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
   Teacher ↔ grade-level assignments (admin-managed M:N)
   ───────────────────────────────────────────────────────────── */

const ASSIGNMENTS_KEY = 'scei_class_assignments_v1'

export type LevelAssignments = Record<EnrollmentLevel, string[]> // teacherId[]

export function getAssignments(): LevelAssignments {
  if (typeof window === 'undefined') return emptyAssignments()
  try {
    const raw = JSON.parse(localStorage.getItem(ASSIGNMENTS_KEY) ?? 'null') as LevelAssignments | null
    return { ...emptyAssignments(), ...(raw ?? {}) }
  } catch { return emptyAssignments() }
}
function emptyAssignments(): LevelAssignments {
  return { KINDER: [], GRADE_1: [], GRADE_2: [], GRADE_3: [], GRADE_4: [], GRADE_5: [], GRADE_6: [] }
}
function writeAssignments(a: LevelAssignments) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(a))
}
export function setAssignmentsForLevel(level: EnrollmentLevel, teacherIds: string[]) {
  const a = getAssignments()
  a[level] = Array.from(new Set(teacherIds))
  writeAssignments(a)
}
export function teacherAssignedLevels(teacherId: string): EnrollmentLevel[] {
  const a = getAssignments()
  return (Object.keys(a) as EnrollmentLevel[]).filter(lvl => a[lvl].includes(teacherId))
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
