import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ── Daily Targets API ────────────────────────────────────────────────────────
// GET  /api/customer-survey/daily-targets?branch=SBEA|SBGH
//   • Authenticated via session (marketing hub dashboard) OR
//   • Authenticated via ?token=<EXTERNAL_API_KEY> (static page at survey.sapphireclinicseast.org)
//
// Returns today's deterministically-selected patients for survey, one per
// clinical staff with confirmed schedules today. Pre-creates PENDING
// SurveyAssignment records so QR codes are ready at day start.

const EXTERNAL_KEY = process.env.EXTERNAL_API_KEY

function branchFromRole(role: string): string | null {
  if (role.startsWith('SBEA_')) return 'SBEA'
  if (role.startsWith('SBGH_')) return 'SBGH'
  return null
}

// Deterministic hash-based RNG: seed → [0,1)
function seededRandom(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  }
  return ((h >>> 0) % 1000000) / 1000000
}

interface DailyTarget {
  assignmentId: string
  staffId: string
  staffName: string
  department: string
  branch: string
  patientId: string
  patientName: string
  patientAge: number | null
  startTime: string
  endTime: string
  sessionType: string
  status: string
  surveyUrl: string
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const queryBranch = searchParams.get('branch')
  const debug = searchParams.get('debug') === '1'

  // Auth: either valid session OR matching external token
  let authedBranch: string | null = null
  let isAdmin = false

  // Static page access code OR EXTERNAL_API_KEY both accepted. Token "scei" is
  // the simple code given to clinic aides at survey.sapphireclinicseast.org.
  const validStaticToken = token === 'scei' || (EXTERNAL_KEY && token === EXTERNAL_KEY)
  if (token && validStaticToken) {
    // External (static page) — trust the requested branch
    authedBranch = queryBranch
    if (!authedBranch || !['SBEA', 'SBGH'].includes(authedBranch)) {
      return NextResponse.json({ error: 'branch query parameter is required (SBEA or SBGH)' }, { status: 400 })
    }
  } else {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = (session.user as { role?: string }).role ?? ''
    isAdmin = ['ADMIN', 'MARKETING_ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN'].includes(role)
    const roleBranch = branchFromRole(role)
    if (isAdmin) {
      authedBranch = queryBranch ?? roleBranch ?? 'SBEA'
    } else {
      authedBranch = roleBranch
    }
    if (!authedBranch) {
      return NextResponse.json({ error: 'branch could not be determined from your role' }, { status: 400 })
    }
  }

  // ── Today in PH time ──
  const now = new Date()
  const phOffset = 8 * 60
  const phNow = new Date(now.getTime() + (phOffset + now.getTimezoneOffset()) * 60000)
  const todayStr = phNow.toISOString().slice(0, 10)
  const todayStart = new Date(`${todayStr}T00:00:00+08:00`)
  const todayEnd = new Date(`${todayStr}T23:59:59+08:00`)

  // ── Fetch today's confirmed schedules for this branch ──
  const schedules = await prisma.schedule.findMany({
    where: {
      date: { gte: todayStart, lte: todayEnd },
      status: 'CONFIRMED',
      staff: { branch: authedBranch },
      patientId: { not: null },
    },
    include: {
      staff:   { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
      patient: { select: { id: true, firstName: true, lastName: true, dob: true } },
      surveyAssignments: { where: { createdAt: { gte: todayStart } } },
    },
    orderBy: { startTime: 'asc' },
  })

  // ── Annual targets (only include staff still below target) ──
  const year = phNow.getFullYear()
  const targets = await prisma.assessmentTarget.findMany({
    where: { year, staff: { branch: authedBranch } },
  })
  const targetMap = new Map(targets.map(t => [t.staffId, t]))

  // Build a set of (staffId|patientId) pairs the patient already actually
  // submitted feedback on this therapist this year — so we don't ask the same
  // patient twice. We intentionally only count COMPLETED assignments here:
  // PENDING/EXPIRED ones (auto-created QRs never scanned) used to lock the
  // pair too, which silently blocked re-prompting for the rest of the year.
  const yearStart = new Date(`${year}-01-01T00:00:00`)
  const yearEnd   = new Date(`${year + 1}-01-01T00:00:00`)
  const priorAssignments = await prisma.surveyAssignment.findMany({
    where: {
      branch: authedBranch,
      createdAt: { gte: yearStart, lt: yearEnd },
      patientId: { not: null },
      status: 'COMPLETED',
    },
    select: { staffId: true, patientId: true },
  })
  const alreadyAssessed = new Set(
    priorAssignments
      .filter(a => a.patientId)
      .map(a => `${a.staffId}|${a.patientId}`)
  )

  // ── Group schedules by staff ──
  const byStaff = new Map<string, typeof schedules>()
  // For ?debug=1 only — track why each schedule was kept or filtered out.
  const debugRows: Array<{
    staffId: string
    staffName: string
    department: string
    patientId: string | null
    patientName: string | null
    startTime: string
    endTime: string
    targetCount: number
    completed: number
    excluded: 'none' | 'no-patient' | 'target-met' | 'patient-already-assessed-this-year'
  }> = []
  for (const sch of schedules) {
    const staffName = `${sch.staff.firstName} ${sch.staff.lastName}`
    const t = targetMap.get(sch.staffId)
    const targetCount = t?.targetCount ?? 10
    const completed   = t?.completed   ?? 0
    if (!sch.patient) {
      if (debug) debugRows.push({
        staffId: sch.staffId, staffName, department: sch.staff.department,
        patientId: sch.patientId, patientName: null,
        startTime: sch.startTime, endTime: sch.endTime,
        targetCount, completed, excluded: 'no-patient',
      })
      continue
    }
    const patientName = `${sch.patient.firstName} ${sch.patient.lastName}`
    if (completed >= targetCount) {
      if (debug) debugRows.push({
        staffId: sch.staffId, staffName, department: sch.staff.department,
        patientId: sch.patient.id, patientName,
        startTime: sch.startTime, endTime: sch.endTime,
        targetCount, completed, excluded: 'target-met',
      })
      continue
    }
    if (alreadyAssessed.has(`${sch.staffId}|${sch.patientId}`)) {
      if (debug) debugRows.push({
        staffId: sch.staffId, staffName, department: sch.staff.department,
        patientId: sch.patient.id, patientName,
        startTime: sch.startTime, endTime: sch.endTime,
        targetCount, completed, excluded: 'patient-already-assessed-this-year',
      })
      continue
    }
    if (debug) debugRows.push({
      staffId: sch.staffId, staffName, department: sch.staff.department,
      patientId: sch.patient.id, patientName,
      startTime: sch.startTime, endTime: sch.endTime,
      targetCount, completed, excluded: 'none',
    })
    if (!byStaff.has(sch.staffId)) byStaff.set(sch.staffId, [])
    byStaff.get(sch.staffId)!.push(sch)
  }

  // ── For each staff, deterministically pick ONE schedule ──
  // But first, honor existing assignments: if the staff already has an active
  // or completed assignment today, use the schedule tied to that assignment.
  const targetsOut: DailyTarget[] = []

  for (const [staffId, staffScheds] of byStaff) {
    // Look for an existing assignment tied to any of this staff's schedules
    let chosenSchedule: (typeof staffScheds)[number] | null = null
    for (const sch of staffScheds) {
      const existing = sch.surveyAssignments.find(
        (a: { status: string; expiresAt: Date }) =>
          a.status === 'COMPLETED' || (a.status !== 'EXPIRED' && a.expiresAt > now)
      )
      if (existing) {
        chosenSchedule = sch
        break
      }
    }
    // No existing — deterministic pick
    if (!chosenSchedule) {
      const seed = `${todayStr}-${staffId}-${authedBranch}`
      const idx = Math.floor(seededRandom(seed) * staffScheds.length)
      chosenSchedule = staffScheds[idx]
    }

    // Ensure assignment exists for chosen schedule
    let assignment = chosenSchedule.surveyAssignments.find(
      (a: { status: string; expiresAt: Date }) =>
        a.status === 'COMPLETED' || (a.status !== 'EXPIRED' && a.expiresAt > now)
    )
    if (!assignment) {
      const patientAge = chosenSchedule.patient!.dob
        ? Math.floor((phNow.getTime() - new Date(chosenSchedule.patient!.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null
      const sessionType = chosenSchedule.sessionType?.toLowerCase().includes('group') ? 'group' : 'individual'
      // SurveyType enum: HR10 (pedia ≤17), HR11 (adult ≥18), HR16 (group therapy)
      const surveyType = sessionType === 'group'
        ? 'HR16'
        : (patientAge !== null && patientAge <= 17 ? 'HR10' : 'HR11')

      const created = await prisma.surveyAssignment.create({
        data: {
          staffId: chosenSchedule.staffId,
          scheduleId: chosenSchedule.id,
          patientId: chosenSchedule.patient!.id,
          patientName: `${chosenSchedule.patient!.firstName} ${chosenSchedule.patient!.lastName}`,
          patientAge,
          branch: authedBranch,
          sessionType,
          surveyType,
          status: 'PENDING',
          expiresAt: todayEnd,
        },
      })
      assignment = { ...created, status: created.status, expiresAt: created.expiresAt }
    }

    const patientAge = chosenSchedule.patient!.dob
      ? Math.floor((phNow.getTime() - new Date(chosenSchedule.patient!.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null

    targetsOut.push({
      assignmentId: assignment.id,
      staffId:      chosenSchedule.staffId,
      staffName:    `${chosenSchedule.staff.firstName} ${chosenSchedule.staff.lastName}`,
      department:   chosenSchedule.staff.department,
      branch:       authedBranch,
      patientId:    chosenSchedule.patient!.id,
      patientName:  `${chosenSchedule.patient!.firstName} ${chosenSchedule.patient!.lastName}`,
      patientAge,
      startTime:    chosenSchedule.startTime,
      endTime:      chosenSchedule.endTime,
      sessionType:  chosenSchedule.sessionType,
      status:       assignment.status,
      surveyUrl:    `https://survey.sapphireclinicseast.org?id=${assignment.id}`,
    })
  }

  // ── HR12: Front desk officers assessed by random patients today ──────────────
  // For each Front Desk Officer at this branch, deterministically pick
  // HR12_PATIENTS_PER_OFFICER unique patients from today's full schedule pool
  // and create HR12 SurveyAssignment records so QR codes are ready.
  // Only staff with jobTitle = 'Front Desk Officer' are included — not all admin.
  const HR12_PATIENTS_PER_OFFICER = 3

  const frontDeskStaff = await prisma.staff.findMany({
    where: { branch: authedBranch, jobTitle: 'Front Desk Officer' },
    select: { id: true, firstName: true, lastName: true, department: true, branch: true },
  })

  // Build de-duplicated pool of unique patients from today's schedules
  const patientPool = [
    ...new Map(
      schedules
        .filter(s => s.patient)
        .map(s => [s.patient!.id, {
          id:   s.patient!.id,
          name: `${s.patient!.firstName} ${s.patient!.lastName}`,
          age:  s.patient!.dob
            ? Math.floor((phNow.getTime() - new Date(s.patient!.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
            : null,
        }])
    ).values(),
  ]

  for (const officer of frontDeskStaff) {
    if (patientPool.length === 0) break

    // Check how many HR12 surveys this officer has received year-to-date
    const t = targetMap.get(officer.id)
    const completed = t?.completed ?? 0
    const targetCount = t?.targetCount ?? 60
    if (completed >= targetCount) continue

    // Deterministic pick of N patients without repeats
    const selected: typeof patientPool = []
    const remaining = [...patientPool]
    for (let i = 0; i < HR12_PATIENTS_PER_OFFICER && remaining.length > 0; i++) {
      const seed = `${todayStr}-${officer.id}-hr12-${i}`
      const idx = Math.floor(seededRandom(seed) * remaining.length)
      selected.push(remaining.splice(idx, 1)[0])
    }

    for (const patient of selected) {
      // Re-use any existing non-expired HR12 assignment for this officer/patient today
      const existing = await prisma.surveyAssignment.findFirst({
        where: {
          staffId:   officer.id,
          patientId: patient.id,
          surveyType: 'HR12',
          createdAt: { gte: todayStart },
          status:    { not: 'EXPIRED' },
        },
      })

      const assignment = existing ?? await prisma.surveyAssignment.create({
        data: {
          staffId:     officer.id,
          patientId:   patient.id,
          patientName: patient.name,
          patientAge:  patient.age,
          branch:      authedBranch,
          surveyType:  'HR12',
          status:      'PENDING',
          expiresAt:   todayEnd,
        },
      })

      targetsOut.push({
        assignmentId: assignment.id,
        staffId:      officer.id,
        staffName:    `${officer.firstName} ${officer.lastName}`,
        department:   officer.department,
        branch:       authedBranch,
        patientId:    patient.id,
        patientName:  patient.name,
        patientAge:   patient.age,
        startTime:    '08:00',
        endTime:      '17:00',
        sessionType:  'front-desk',
        status:       assignment.status,
        surveyUrl:    `https://survey.sapphireclinicseast.org?id=${assignment.id}`,
      })
    }
  }

  // Sort by startTime
  targetsOut.sort((a, b) => a.startTime.localeCompare(b.startTime))

  if (debug) {
    // Build a per-staff diagnostic summary so the operator can see exactly why
    // a schedule was (or wasn't) chosen. Useful when count=0 looks wrong.
    const totalSchedulesConsidered = schedules.length
    const reasonCounts = debugRows.reduce<Record<string, number>>((acc, r) => {
      acc[r.excluded] = (acc[r.excluded] ?? 0) + 1
      return acc
    }, {})
    return NextResponse.json({
      date: todayStr,
      branch: authedBranch,
      count: targetsOut.length,
      targets: targetsOut,
      debug: {
        totalSchedulesConsidered,
        reasonCounts,
        schedules: debugRows,
        priorAssignmentsThisYear: priorAssignments.length,
      },
    })
  }

  return NextResponse.json({
    date: todayStr,
    branch: authedBranch,
    count: targetsOut.length,
    targets: targetsOut,
  })
}
