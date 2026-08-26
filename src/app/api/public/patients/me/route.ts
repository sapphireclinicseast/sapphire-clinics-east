// GET /api/public/patients/me?token=...
// Returns everything the signed-in patient portal dashboard needs in one call:
//   profile         — demographics (mirrors the teletherapy hub patient profile)
//   servicesAvailed — distinct departments the patient has had sessions/bookings in
//   sessions        — session history (date, time, clinician) newest-first
//   surveys         — ACTIVE survey assignments only (non-expired, not completed)
//
// Token is the same HMAC patient token issued by login/register.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { branchLabel } from '@/lib/branch-label'
import { linkedPatientIds } from '@/lib/patient-links'
import { preflight, withCors } from '../../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

const DEPT_LABEL: Record<string, string> = {
  OT: 'Occupational Therapy (OT)',
  PT: 'Physical Therapy (PT)',
  SLP: 'Speech-Language Pathology (SLP)',
  SPED: 'Special Education (SPED)',
  MD: 'Medical Doctor (MD)',
  PSYCHOLOGY: 'Psychology',
  ORTHOSIS: 'Orthosis / Prosthesis',
  PSYCHIATRY: 'Psychiatry',
  DEVELOPMENTAL_PEDIATRICIAN: 'Developmental Pediatrician',
  REHABILITATION_MEDICINE: 'Rehabilitation Medicine',
}
// Departments that aren't clinical services and shouldn't appear under "availed".
const NON_SERVICE = new Set(['FRONT_DESK', 'ADMINISTRATION'])


function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

function ageFromDob(dob: Date | null): number | null {
  if (!dob) return null
  const now = new Date()
  let age = now.getUTCFullYear() - dob.getUTCFullYear()
  const m = now.getUTCMonth() - dob.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--
  return age >= 0 && age < 150 ? age : null
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const session = verifyPatientToken(token)
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  const patient = await prisma.patient.findUnique({
    where: { id: session.patientId },
    select: {
      id: true, firstName: true, lastName: true, dob: true, sex: true,
      patientType: true, diagnosis: true, city: true, branch: true, branches: true,
      email: true, phone: true, address: true, civilStatus: true,
      pwdSeniorId: true, username: true, profilePhoto: true,
      referralUrl: true, pwdIdUrl: true,
    },
  })
  if (!patient) {
    return withCors(NextResponse.json({ error: 'Patient not found' }, { status: 404 }), origin)
  }

  const now = new Date()

  // Combine interbranch records (same person, one Patient row per branch) so the
  // portal shows all their sessions across branches.
  const patientIds = await linkedPatientIds(patient.id)

  const [schedules, bookings, assignments, linkedRecords] = await Promise.all([
    prisma.schedule.findMany({
      // All statuses (incl. CANCELLED / RESCHEDULED) so the portal can show the
      // patient's full attendance record.
      where: { patientId: { in: patientIds } },
      orderBy: { date: 'desc' },
      // High headroom for full session-history backfills (2024→): a multi-year,
      // multi-department patient can accumulate many hundreds of schedules and
      // the newest-N cap would silently hide their oldest sessions.
      take: 2000,
      select: {
        id: true, patientId: true, date: true, startTime: true, endTime: true, status: true,
        isTeletherapy: true, notes: true,
        staff: { select: { firstName: true, lastName: true, department: true, branch: true } },
      },
    }),
    prisma.patientBooking.findMany({
      where: { patientId: { in: patientIds }, status: { in: ['PAID', 'COMPLETED'] } },
      orderBy: { date: 'desc' },
      take: 500,
      select: {
        id: true, date: true, startTime: true, endTime: true, status: true,
        department: true, branch: true, isTeletherapy: true, notes: true,
        staff: { select: { firstName: true, lastName: true, department: true, branch: true } },
      },
    }),
    prisma.surveyAssignment.findMany({
      where: {
        patientId: patient.id,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, surveyType: true, expiresAt: true, createdAt: true },
    }),
    // Branch per interbranch record — a session's real branch is the branch of
    // the Patient row that owns it, NOT the consultant's home branch (an
    // interbranch consultant staffs both branches under one Staff.branch).
    prisma.patient.findMany({
      where: { id: { in: patientIds } },
      select: { id: true, branch: true, branches: true },
    }),
  ])
  // Prefer the CRM's multi-branch `branches[]` (primary) over legacy `branch`.
  const branchByPatientId = new Map(
    linkedRecords.map((r) => [r.id, (r.branches?.[0] ?? r.branch) as string | null]),
  )

  // Psychology / Medical (MD) session notes are confidential — the patient only
  // sees the note text if the clinician ticked "Show to Others" on it. The flag
  // lives on the teletherapy SessionNote (keyed by scheduleId).
  const CONFIDENTIAL_DEPTS = new Set(['PSYCHOLOGY', 'MD'])
  const scheduleIds = schedules.map((s) => s.id)
  const sharedNotes = scheduleIds.length
    ? await prisma.sessionNote.findMany({ where: { scheduleId: { in: scheduleIds } }, select: { scheduleId: true, sharedWithOthers: true } }).catch(() => [])
    : []
  const sharedByScheduleId = new Map(sharedNotes.map((n) => [n.scheduleId, n.sharedWithOthers]))

  // ── Services availed (distinct departments across both session sources) ──
  const deptSet = new Set<string>()
  for (const s of schedules) if (s.staff?.department) deptSet.add(s.staff.department)
  for (const b of bookings) {
    const d = (b.staff?.department ?? b.department ?? '').toUpperCase()
    if (d) deptSet.add(d)
  }
  const servicesAvailed = [...deptSet]
    .filter((d) => !NON_SERVICE.has(d))
    .map((d) => DEPT_LABEL[d] ?? titleCase(d))
    .sort()

  // ── Session history (merge both sources, newest first) ──
  type Session = {
    id: string
    date: string
    startTime: string
    endTime: string
    clinician: string
    department: string
    departmentCode: string
    branch: string
    status: string
    isTeletherapy: boolean
    notes: string | null
    source: 'schedule' | 'booking'
  }
  const clin = (f?: string | null, l?: string | null) =>
    titleCase(`${f ?? ''} ${l ?? ''}`.trim()) || 'Clinician'
  // Normalise branch across sources: Schedule staff use "SBEA"/"SBGH";
  // PatientBooking uses "SANDBOX_EAST"/"SANDBOX_GREENHILLS".
  const branchShort = (b?: string | null): string => {
    const v = (b ?? '').toUpperCase()
    if (v === 'SBEA' || v === 'SANDBOX_EAST') return 'East'
    if (v === 'SBGH' || v === 'SANDBOX_GREENHILLS') return 'Greenhills'
    return ''
  }

  const sessions: Session[] = [
    ...schedules.map((s): Session => {
      const code = (s.staff?.department ?? '').toUpperCase()
      return {
        id: s.id,
        date: s.date.toISOString().slice(0, 10),
        startTime: s.startTime,
        endTime: s.endTime,
        clinician: clin(s.staff?.firstName, s.staff?.lastName),
        department: code ? (DEPT_LABEL[code] ?? titleCase(code)) : '',
        departmentCode: code,
        branch: branchShort(branchByPatientId.get(s.patientId ?? '') ?? s.staff?.branch),
        status: s.status,
        isTeletherapy: s.isTeletherapy,
        notes: (CONFIDENTIAL_DEPTS.has(code) && !sharedByScheduleId.get(s.id)) ? null : (s.notes ?? null),
        source: 'schedule',
      }
    }),
    ...bookings.map((b): Session => {
      const code = (b.staff?.department ?? b.department ?? '').toUpperCase()
      return {
        id: b.id,
        date: b.date.toISOString().slice(0, 10),
        startTime: b.startTime,
        endTime: b.endTime,
        clinician: clin(b.staff?.firstName, b.staff?.lastName),
        department: code ? (DEPT_LABEL[code] ?? titleCase(code)) : '',
        departmentCode: code,
        branch: branchShort(b.branch ?? b.staff?.branch),
        status: b.status,
        isTeletherapy: b.isTeletherapy,
        // Bookings carry no per-note share flag, so Psychology/MD booking notes
        // stay hidden from the patient.
        notes: CONFIDENTIAL_DEPTS.has(code) ? null : (b.notes ?? null),
        source: 'booking',
      }
    }),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.startTime < b.startTime ? 1 : -1))

  // The same appointment slot (person + date + time + clinician + department)
  // can appear as duplicate rows across the interbranch records — e.g. a session
  // first booked PENDING under one branch, then moved and RESOLVED (confirmed /
  // cancelled / rescheduled) under another. Drop the stale PENDING copy when the
  // slot already has a resolved outcome, then collapse any remaining exact
  // duplicates. A slot with only PENDING rows (no resolved twin) still shows.
  const resolvedSlots = new Set(
    sessions
      .filter((s) => s.status !== 'PENDING')
      .map((s) => `${s.date}|${s.startTime}|${s.endTime}|${s.clinician}|${s.departmentCode}`),
  )
  const seen = new Set<string>()
  const dedupedSessions = sessions.filter((s) => {
    const slot = `${s.date}|${s.startTime}|${s.endTime}|${s.clinician}|${s.departmentCode}`
    if (s.status === 'PENDING' && resolvedSlots.has(slot)) return false
    const key = `${slot}|${s.status}|${s.branch}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // ── Attendance stats (Confirmed vs Cancelled/Rescheduled; PENDING excluded) ──
  const CONFIRMED = new Set(['CONFIRMED', 'PAID', 'COMPLETED'])
  const CANCELLED_RESCHED = new Set(['CANCELLED', 'RESCHEDULED'])
  const counted = dedupedSessions.filter((s) => CONFIRMED.has(s.status) || CANCELLED_RESCHED.has(s.status))
  const confirmedCount = counted.filter((s) => CONFIRMED.has(s.status)).length
  const cancelledCount = counted.filter((s) => CANCELLED_RESCHED.has(s.status)).length
  const totalCounted = counted.length
  const pct = (n: number) => (totalCounted > 0 ? Math.round((n / totalCounted) * 1000) / 10 : 0)
  const stats = {
    total: totalCounted,
    confirmed: confirmedCount,
    confirmedPct: pct(confirmedCount),
    cancelledRescheduled: cancelledCount,
    cancelledRescheduledPct: pct(cancelledCount),
  }

  // ── Active surveys (links built client-side to the survey subdomain) ──
  const surveys = assignments.map((a) => ({
    id: a.id,
    surveyType: a.surveyType,
    expiresAt: a.expiresAt.toISOString(),
  }))

  // Compose a single human-readable address line (street/barangay + city).
  const addressLine = [patient.address, patient.city]
    .map((p) => (p ? titleCase(p) : ''))
    .filter(Boolean)
    .join(', ') || null

  const profile = {
    fullName: titleCase(`${patient.firstName} ${patient.lastName}`),
    dob: patient.dob ? patient.dob.toISOString().slice(0, 10) : null,
    sex: patient.sex ? titleCase(patient.sex) : null,
    age: ageFromDob(patient.dob),
    patientType: patient.patientType === 'PEDIATRIC' ? 'Pediatric' : 'Adult',
    diagnosis: patient.diagnosis ? titleCase(patient.diagnosis) : null,
    city: patient.city ? titleCase(patient.city) : null,
    branch: (patient.branches?.[0] ?? patient.branch)
      ? (branchLabel(patient.branches?.[0] ?? patient.branch) ?? (patient.branches?.[0] ?? patient.branch))
      : null,
    // Contact + ID fields for the patient-facing portal profile section.
    email: patient.email ? patient.email.trim() : null,
    phone: patient.phone ? patient.phone.trim() : null,
    address: addressLine,
    civilStatus: patient.civilStatus ? titleCase(patient.civilStatus) : null,
    pwdSeniorId: patient.pwdSeniorId ? patient.pwdSeniorId.trim() : null,
    username: patient.username ?? null,
    profilePhoto: patient.profilePhoto ?? null,
    referralUrl: patient.referralUrl ?? null,
    pwdIdUrl: patient.pwdIdUrl ?? null,
  }

  return withCors(NextResponse.json({ profile, servicesAvailed, sessions: dedupedSessions, surveys, stats }), origin)
}
