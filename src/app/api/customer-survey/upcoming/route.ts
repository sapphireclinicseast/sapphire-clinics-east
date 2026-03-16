import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function branchFromRole(role: string): string | null {
  if (role.startsWith('SBEA_')) return 'SBEA'
  if (role.startsWith('SBGH_')) return 'SBGH'
  return null
}

// ── GET /api/customer-survey/upcoming ────────────────────────────────────────
// Returns upcoming survey prompts for front desk users based on today's schedule.
// Auto-selects a random patient per therapist who needs assessment.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string }).role ?? ''
  const branch = branchFromRole(role)
  const isFrontDesk = role === 'SBEA_FRONT_DESK' || role === 'SBGH_FRONT_DESK'

  if (!isFrontDesk || !branch) {
    return NextResponse.json({ prompts: [] })
  }

  // Get today's date range in PH timezone
  const now = new Date()
  const phOffset = 8 * 60 // UTC+8
  const phNow = new Date(now.getTime() + (phOffset + now.getTimezoneOffset()) * 60000)
  const todayStr = phNow.toISOString().slice(0, 10) // YYYY-MM-DD
  const todayStart = new Date(`${todayStr}T00:00:00+08:00`)
  const todayEnd = new Date(`${todayStr}T23:59:59+08:00`)

  const currentHH = String(phNow.getHours()).padStart(2, '0')
  const currentMM = String(phNow.getMinutes()).padStart(2, '0')
  const currentTime = `${currentHH}:${currentMM}`

  // Auto-expire stale PENDING assignments (older than 30 minutes)
  await prisma.surveyAssignment.updateMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: now },
    },
    data: { status: 'EXPIRED' },
  })

  // Get today's confirmed schedules at this branch with patients
  const schedules = await prisma.schedule.findMany({
    where: {
      date: { gte: todayStart, lte: todayEnd },
      status: 'CONFIRMED',
      staff: { branch },
      patientId: { not: null },
    },
    include: {
      staff: true,
      patient: true,
      surveyAssignments: { where: { createdAt: { gte: todayStart } } },
    },
    orderBy: { startTime: 'asc' },
  })

  // Get assessment targets for this year
  const year = phNow.getFullYear()
  const targets = await prisma.assessmentTarget.findMany({
    where: { year, staff: { branch } },
  })
  const targetMap = new Map(targets.map(t => [t.staffId, t]))

  // Find schedules that need survey prompts:
  // 1. No survey assignment created yet for this schedule
  // 2. The therapist is behind on their assessment target
  const prompts: {
    scheduleId: string
    staffId: string
    staffName: string
    department: string
    patientId: string
    patientName: string
    patientAge: number | null
    startTime: string
    endTime: string
    sessionType: string
    promptType: 'pre_session' | 'end_session'
  }[] = []

  for (const sched of schedules) {
    if (!sched.patient) continue
    // Skip if this schedule already has a COMPLETED or active (non-expired) assignment
    const hasActiveOrCompleted = sched.surveyAssignments.some(
      (a: { status: string; expiresAt: Date }) =>
        a.status === 'COMPLETED' || (a.status !== 'EXPIRED' && a.expiresAt > now)
    )
    if (hasActiveOrCompleted) continue

    const target = targetMap.get(sched.staffId)
    const targetCount = target?.targetCount ?? 10
    const completed = target?.completed ?? 0

    // Only prompt if therapist still needs assessments
    if (completed >= targetCount) continue

    // Calculate patient age
    let patientAge: number | null = null
    if (sched.patient.dob) {
      const dob = new Date(sched.patient.dob)
      patientAge = Math.floor((phNow.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    }

    // Determine prompt type based on timing
    // Pre-session: 10 min before startTime
    // End-session: 5 min before endTime
    const prePromptTime = subtractMinutes(sched.startTime, 10)
    const endPromptTime = subtractMinutes(sched.endTime, 5)

    let promptType: 'pre_session' | 'end_session' | null = null

    if (currentTime >= prePromptTime && currentTime < sched.startTime) {
      promptType = 'pre_session'
    } else if (currentTime >= endPromptTime && currentTime <= sched.endTime) {
      promptType = 'end_session'
    }

    if (promptType) {
      prompts.push({
        scheduleId: sched.id,
        staffId: sched.staffId,
        staffName: `${sched.staff.firstName} ${sched.staff.lastName}`,
        department: sched.staff.department,
        patientId: sched.patient.id,
        patientName: `${sched.patient.firstName} ${sched.patient.lastName}`,
        patientAge,
        startTime: sched.startTime,
        endTime: sched.endTime,
        sessionType: sched.sessionType,
        promptType,
      })
    }
  }

  // Randomly select one prompt if multiple are available
  // (user wants "randomly choose a patient who will assess")
  if (prompts.length > 1) {
    const idx = Math.floor(Math.random() * prompts.length)
    return NextResponse.json({ prompts: [prompts[idx]] })
  }

  return NextResponse.json({ prompts })
}

function subtractMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m - minutes
  const adjTotal = total < 0 ? 0 : total
  return `${String(Math.floor(adjTotal / 60)).padStart(2, '0')}:${String(adjTotal % 60).padStart(2, '0')}`
}
