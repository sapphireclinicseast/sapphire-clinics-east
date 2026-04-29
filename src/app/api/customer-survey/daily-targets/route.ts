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
    isAdmin = ['ADMIN', 'MARKETING_ADMIN', 'SBEA_ADMIN', 'SBGH_ADMIN'].includes(role)
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

  // Build a set of (staffId|patientId) pairs already assigned this year
  // so we never pick the same patient twice to assess the same therapist.
  const yearStart = new Date(`${year}-01-01T00:00:00`)
  const yearEnd   = new Date(`${year + 1}-01-01T00:00:00`)
  const priorAssignments = await prisma.surveyAssignment.findMany({
    where: {
      branch: authedBranch,
      createdAt: { gte: yearStart, lt: yearEnd },
      patientId: { not: null },
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
  for (const sch of schedules) {
    if (!sch.patient) continue
    const t = targetMap.get(sch.staffId)
    const targetCount = t?.targetCount ?? 10
    const completed   = t?.completed   ?? 0
    if (completed >= targetCount) continue  // already met target
    // Skip if this patient already assessed this therapist this year
    if (alreadyAssessed.has(`${sch.staffId}|${sch.patientId}`)) continue
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

  // Sort by startTime
  targetsOut.sort((a, b) => a.startTime.localeCompare(b.startTime))

  return NextResponse.json({
    date: todayStr,
    branch: authedBranch,
    count: targetsOut.length,
    targets: targetsOut,
  })
}
