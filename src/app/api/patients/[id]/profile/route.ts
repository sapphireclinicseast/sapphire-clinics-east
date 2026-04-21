import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─── GET /api/patients/[id]/profile ─────────────────────────────────────────
// Returns full patient profile including demographics, session summary,
// clinicians, and session history.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Fetch patient with schedules (and the staff/clinician on each schedule)
  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      schedules: {
        include: {
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: true,
              branch: true,
            },
          },
        },
        orderBy: { date: 'desc' },
      },
    },
  })

  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  // Compute session stats
  const schedules = patient.schedules
  const totalSessions = schedules.length
  const confirmed = schedules.filter(s => s.status === 'CONFIRMED').length
  const rescheduled = schedules.filter(s => s.status === 'RESCHEDULED').length
  const pending = schedules.filter(s => s.status === 'PENDING').length
  const cancelled = schedules.filter(s => s.status === 'CANCELLED').length

  // Unique clinicians
  const clinicianMap = new Map<string, { id: string; name: string; department: string }>()
  for (const sched of schedules) {
    if (sched.staff && !clinicianMap.has(sched.staff.id)) {
      clinicianMap.set(sched.staff.id, {
        id: sched.staff.id,
        name: `${sched.staff.firstName} ${sched.staff.lastName}`,
        department: sched.staff.department,
      })
    }
  }

  // Session history table
  const sessionHistory = schedules.map(s => ({
    date: s.date,
    sessionType: s.sessionType,
    startTime: s.startTime,
    endTime: s.endTime,
    status: s.status,
    clinician: s.staff
      ? `${s.staff.firstName} ${s.staff.lastName}`
      : 'N/A',
    clinicianDept: s.staff?.department ?? '',
    notes: s.notes,
  }))

  // ── Patient complaints — fetched from HR Platform ──────────────────────────
  // Uses the /patient-complaints?patientName=... endpoint which handles name
  // matching server-side and merges submissions + converted incidents.
  let complaints: Array<{ date: string; text: string; status: string; reference?: string; concernType?: string; branch?: string; escalationLevel?: string }> = []
  const hrBaseUrl = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
  const hrApiKey = process.env.HR_PLATFORM_API_KEY

  if (hrApiKey) {
    try {
      const patientFullName = `${patient.firstName} ${patient.lastName}`
      const url = `${hrBaseUrl}/patient-complaints?patientName=${encodeURIComponent(patientFullName)}`

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${hrApiKey}` },
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        const data = await res.json()
        const items = data.complaints ?? []
        complaints = (Array.isArray(items) ? items : []).map((c: any) => ({
          date: c.date ?? '',
          text: c.description ?? '',
          status: c.status ?? 'Pending Review',
          reference: c.referenceNo ?? c.id ?? '',
          concernType: c.concernType ?? null,
          branch: c.branch ?? null,
          escalationLevel: c.escalationLevel ?? null,
        }))
      }
    } catch {
      // HR platform unreachable — complaints will be empty
    }
  }

  return NextResponse.json({
    patient: {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email,
      phone: patient.phone,
      dob: patient.dob,
      patientType: patient.patientType,
      sex: patient.sex,
      civilStatus: patient.civilStatus,
      religion: patient.religion,
      nationality: patient.nationality,
      address: patient.address,
      city: patient.city,
      diagnosis: patient.diagnosis,
      notes: patient.notes,
      firstDayOfConsult: patient.firstDayOfConsult,
      branches: patient.branches,
      branch: patient.branch,
    },
    stats: {
      total: totalSessions,
      confirmed,
      rescheduled,
      pending,
      cancelled,
    },
    clinicians: Array.from(clinicianMap.values()),
    sessionHistory,
    complaints,
  })
}
