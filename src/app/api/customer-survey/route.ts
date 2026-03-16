import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function branchFromRole(role: string): string | null {
  if (role.startsWith('SBEA_')) return 'SBEA'
  if (role.startsWith('SBGH_')) return 'SBGH'
  return null
}

// ── GET /api/customer-survey — Dashboard stats + staff list ──────────────────
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string }).role ?? ''
  const userBranch = branchFromRole(role)
  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') // 'dashboard' | 'staff'
  const year = parseInt(searchParams.get('year') ?? '') || new Date().getFullYear()

  if (view === 'staff') {
    // Return staff with assessment progress — filtered by branch for front desk
    const staff = await prisma.staff.findMany({
      where: userBranch ? { branch: userBranch } : {},
      include: {
        assessmentTargets: { where: { year } },
        surveyResponses: {
          where: { submittedAt: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) } },
          select: { submittedAt: true },
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ department: 'asc' }, { lastName: 'asc' }],
    })

    return NextResponse.json(staff.map(s => {
      const target = s.assessmentTargets[0]
      const defaultTarget = ['MD', 'PSYCHOLOGY'].includes(s.department) ? 4 : 4
      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        department: s.department,
        branch: s.branch,
        targetCount: target?.targetCount ?? defaultTarget,
        completed: target?.completed ?? 0,
        lastAssessed: s.surveyResponses[0]?.submittedAt ?? null,
      }
    }))
  }

  // Dashboard overview
  const yearStart = new Date(`${year}-01-01`)
  const yearEnd = new Date(`${year + 1}-01-01`)
  const branchFilter = userBranch ? { branch: userBranch } : {}

  const [totalSurveys, responses, targets, pending] = await Promise.all([
    prisma.surveyResponse.count({
      where: { submittedAt: { gte: yearStart, lt: yearEnd }, ...branchFilter },
    }),
    prisma.surveyResponse.findMany({
      where: { submittedAt: { gte: yearStart, lt: yearEnd }, ...branchFilter },
      select: { responsesJson: true, branch: true, staff: { select: { department: true } }, submittedAt: true },
    }),
    prisma.assessmentTarget.aggregate({
      where: { year, staff: branchFilter },
      _sum: { completed: true, targetCount: true },
    }),
    prisma.surveyAssignment.count({
      where: { status: 'PENDING', ...branchFilter },
    }),
  ])

  // Calculate avg score from responses
  let totalScore = 0
  let scoreCount = 0
  const branchScores: Record<string, { total: number; count: number; responses: number }> = {}
  const monthlyScores: Record<string, { total: number; count: number; responses: number }> = {}

  for (const r of responses) {
    const json = r.responsesJson as { ratings?: { value: number }[] }
    if (json?.ratings) {
      for (const rating of json.ratings) {
        totalScore += rating.value
        scoreCount++

        // By branch
        if (!branchScores[r.branch]) branchScores[r.branch] = { total: 0, count: 0, responses: 0 }
        branchScores[r.branch].total += rating.value
        branchScores[r.branch].count++
      }
      if (!branchScores[r.branch]) branchScores[r.branch] = { total: 0, count: 0, responses: 0 }
      branchScores[r.branch].responses++

      // Monthly
      const month = String(r.submittedAt.getMonth() + 1).padStart(2, '0')
      if (!monthlyScores[month]) monthlyScores[month] = { total: 0, count: 0, responses: 0 }
      for (const rating of json.ratings) {
        monthlyScores[month].total += rating.value
        monthlyScores[month].count++
      }
      monthlyScores[month].responses++
    }
  }

  const completedSum = targets._sum.completed ?? 0
  const targetSum = targets._sum.targetCount ?? 0

  return NextResponse.json({
    totalSurveys,
    avgScore: scoreCount > 0 ? parseFloat((totalScore / scoreCount).toFixed(2)) : null,
    completionRate: targetSum > 0 ? parseFloat((completedSum / targetSum * 100).toFixed(1)) : 0,
    completedCount: completedSum,
    targetCount: targetSum,
    pending,
    byBranch: Object.entries(branchScores).map(([branch, data]) => ({
      branch,
      avgScore: parseFloat((data.total / data.count).toFixed(2)),
      count: data.responses,
    })),
    monthlyTrend: Object.entries(monthlyScores)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        avgScore: parseFloat((data.total / data.count).toFixed(2)),
        count: data.responses,
      })),
  })
}

// ── POST /api/customer-survey — Create assignment ────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffId, patientId, patientName, patientAge, branch, sessionType, scheduleId } = await req.json()

  if (!staffId || !branch) {
    return NextResponse.json({ error: 'staffId and branch are required' }, { status: 400 })
  }

  // Determine survey type
  const staff = await prisma.staff.findUnique({ where: { id: staffId } })
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  let surveyType: 'HR10' | 'HR11' | 'HR12' | 'HR16'
  if (sessionType === 'group') {
    surveyType = 'HR16'
  } else if (patientAge !== undefined && patientAge !== null && patientAge < 18) {
    surveyType = 'HR10'
  } else {
    surveyType = 'HR11'
  }

  const assignment = await prisma.surveyAssignment.create({
    data: {
      staffId,
      scheduleId: scheduleId ?? null,
      patientId: patientId ?? null,
      surveyType,
      patientName: patientName ?? null,
      patientAge: patientAge ?? null,
      branch,
      sessionType: sessionType ?? 'individual',
      assignedBy: (session.user as { id: string }).id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  })

  return NextResponse.json({
    assignmentId: assignment.id,
    surveyType: assignment.surveyType,
    expiresAt: assignment.expiresAt,
  })
}
