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

const BRANCH_LABEL: Record<string, string> = {
  SANDBOX_EAST: 'East Branch',
  SANDBOX_GREENHILLS: 'Greenhills Branch',
  VERDANA_STORE: 'Verdana Store',
}

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
      patientType: true, diagnosis: true, city: true, branch: true,
    },
  })
  if (!patient) {
    return withCors(NextResponse.json({ error: 'Patient not found' }, { status: 404 }), origin)
  }

  const now = new Date()

  const [schedules, bookings, assignments] = await Promise.all([
    prisma.schedule.findMany({
      where: { patientId: patient.id, status: { not: 'CANCELLED' } },
      orderBy: { date: 'desc' },
      take: 100,
      select: {
        id: true, date: true, startTime: true, endTime: true, status: true,
        isTeletherapy: true,
        staff: { select: { firstName: true, lastName: true, department: true } },
      },
    }),
    prisma.patientBooking.findMany({
      where: { patientId: patient.id, status: { in: ['PAID', 'COMPLETED'] } },
      orderBy: { date: 'desc' },
      take: 100,
      select: {
        id: true, date: true, startTime: true, endTime: true, status: true,
        department: true, isTeletherapy: true,
        staff: { select: { firstName: true, lastName: true, department: true } },
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
  ])

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
    status: string
    isTeletherapy: boolean
    source: 'schedule' | 'booking'
  }
  const clin = (f?: string | null, l?: string | null) =>
    titleCase(`${f ?? ''} ${l ?? ''}`.trim()) || 'Clinician'

  const sessions: Session[] = [
    ...schedules.map((s): Session => ({
      id: s.id,
      date: s.date.toISOString().slice(0, 10),
      startTime: s.startTime,
      endTime: s.endTime,
      clinician: clin(s.staff?.firstName, s.staff?.lastName),
      department: s.staff?.department ? (DEPT_LABEL[s.staff.department] ?? titleCase(s.staff.department)) : '',
      status: s.status,
      isTeletherapy: s.isTeletherapy,
      source: 'schedule',
    })),
    ...bookings.map((b): Session => {
      const d = (b.staff?.department ?? b.department ?? '').toUpperCase()
      return {
        id: b.id,
        date: b.date.toISOString().slice(0, 10),
        startTime: b.startTime,
        endTime: b.endTime,
        clinician: clin(b.staff?.firstName, b.staff?.lastName),
        department: d ? (DEPT_LABEL[d] ?? titleCase(d)) : '',
        status: b.status,
        isTeletherapy: b.isTeletherapy,
        source: 'booking',
      }
    }),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.startTime < b.startTime ? 1 : -1))

  // ── Active surveys (links built client-side to the survey subdomain) ──
  const surveys = assignments.map((a) => ({
    id: a.id,
    surveyType: a.surveyType,
    expiresAt: a.expiresAt.toISOString(),
  }))

  const profile = {
    fullName: titleCase(`${patient.firstName} ${patient.lastName}`),
    dob: patient.dob ? patient.dob.toISOString().slice(0, 10) : null,
    sex: patient.sex ? titleCase(patient.sex) : null,
    age: ageFromDob(patient.dob),
    patientType: patient.patientType === 'PEDIATRIC' ? 'Pediatric' : 'Adult',
    diagnosis: patient.diagnosis ? titleCase(patient.diagnosis) : null,
    city: patient.city ? titleCase(patient.city) : null,
    branch: patient.branch ? (BRANCH_LABEL[patient.branch] ?? patient.branch) : null,
  }

  return withCors(NextResponse.json({ profile, servicesAvailed, sessions, surveys }), origin)
}
