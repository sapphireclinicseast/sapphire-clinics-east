import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Roles that can access the Results tab
const RESULTS_ROLES = ['MARKETING_ADMIN', 'SUPERADMIN', 'ADMIN', 'SBEA_ADMIN', 'SBGH_ADMIN']

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

  if (view === 'pending') {
    // Return pending survey assignments
    const pendingAssignments = await prisma.surveyAssignment.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        expiresAt: { gt: new Date() },
        ...(userBranch ? { branch: userBranch } : {}),
      },
      include: { staff: { select: { firstName: true, lastName: true, department: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json(pendingAssignments.map(a => ({
      id: a.id,
      staffName: `${a.staff.firstName} ${a.staff.lastName}`,
      staffDept: a.staff.department,
      patientName: a.patientName,
      surveyType: a.surveyType,
      branch: a.branch,
      status: a.status,
      createdAt: a.createdAt,
      expiresAt: a.expiresAt,
    })))
  }

  if (view === 'results') {
    // Access control: only Admin, SBEA_ADMIN, SBGH_ADMIN
    const canViewResults = RESULTS_ROLES.includes(role)
    if (!canViewResults) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    // Branch admins only see their branch
    const resultsBranch = role === 'SBEA_ADMIN' ? 'SBEA' : role === 'SBGH_ADMIN' ? 'SBGH' : null

    const assignments = await prisma.surveyAssignment.findMany({
      where: resultsBranch ? { branch: resultsBranch } : {},
      include: {
        staff: { select: { firstName: true, lastName: true, department: true } },
        response: { select: { id: true, submittedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json(assignments.map(a => ({
      id: a.id,
      staffName: `${a.staff.firstName} ${a.staff.lastName}`,
      staffDept: a.staff.department,
      patientName: a.patientName,
      surveyType: a.surveyType,
      branch: a.branch,
      status: a.status,
      createdAt: a.createdAt,
      expiresAt: a.expiresAt,
      hasResponse: !!a.response,
      submittedAt: a.response?.submittedAt ?? null,
    })))
  }

  if (view === 'results-dashboard') {
    // Access control: only Admin, SBEA_ADMIN, SBGH_ADMIN
    const canViewResults = RESULTS_ROLES.includes(role)
    if (!canViewResults) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    const resultsBranch = role === 'SBEA_ADMIN' ? 'SBEA' : role === 'SBGH_ADMIN' ? 'SBGH' : null

    // Optional filters from query string
    const filterBranch = searchParams.get('branch') || null
    const filterStaff = searchParams.get('staffId') || null
    const filterMonth = parseInt(searchParams.get('month') ?? '') || 0 // 1-12, 0 = all

    const yearStart = new Date(`${year}-01-01`)
    const yearEnd = new Date(`${year + 1}-01-01`)

    // Effective branch filter: branch admin locked to their branch, main admin can pick
    const effectiveBranch = resultsBranch ?? filterBranch

    const branchWhere = effectiveBranch ? { branch: effectiveBranch } : {}

    // Get all completed responses for the year
    const responses = await prisma.surveyResponse.findMany({
      where: {
        submittedAt: { gte: yearStart, lt: yearEnd },
        ...branchWhere,
        ...(filterStaff ? { staffId: filterStaff } : {}),
        staff: { active: true }, // exclude inactive staff from Top 5 / leaderboard
      },
      include: {
        staff: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
        assignment: { select: { patientName: true, sessionType: true } },
      },
      orderBy: { submittedAt: 'desc' },
    })

    // Load leaderboard weight settings
    const settings = await prisma.surveySettings.findUnique({ where: { id: 'default' } })
    const wConfirmed = (settings?.weightConfirmed ?? 50) / 100
    const wRescheduled = (settings?.weightRescheduled ?? 0) / 100
    const wCancelled = (settings?.weightCancelled ?? 0) / 100
    const wSatisfaction = (settings?.weightSatisfaction ?? 50) / 100

    // Get session counts by status from Schedule table
    const confirmedCounts = await prisma.schedule.groupBy({
      by: ['staffId'],
      where: {
        date: { gte: yearStart, lt: yearEnd },
        status: 'CONFIRMED',
        staff: branchWhere,
        ...(filterStaff ? { staffId: filterStaff } : {}),
      },
      _count: { _all: true },
    })
    const sessionMap = new Map(confirmedCounts.map((s: { staffId: string; _count: { _all: number } }) => [s.staffId, s._count._all]))

    const rescheduledCounts = await prisma.schedule.groupBy({
      by: ['staffId'],
      where: {
        date: { gte: yearStart, lt: yearEnd },
        status: 'RESCHEDULED',
        staff: branchWhere,
        ...(filterStaff ? { staffId: filterStaff } : {}),
      },
      _count: { _all: true },
    })
    const rescheduledMap = new Map(rescheduledCounts.map((s: { staffId: string; _count: { _all: number } }) => [s.staffId, s._count._all]))

    const cancelledCounts = await prisma.schedule.groupBy({
      by: ['staffId'],
      where: {
        date: { gte: yearStart, lt: yearEnd },
        status: 'CANCELLED',
        staff: branchWhere,
        ...(filterStaff ? { staffId: filterStaff } : {}),
      },
      _count: { _all: true },
    })
    const cancelledMap = new Map(cancelledCounts.map((s: { staffId: string; _count: { _all: number } }) => [s.staffId, s._count._all]))

    // Monthly session counts (for month filter display)
    const monthlySessionCounts = filterMonth ? await prisma.schedule.groupBy({
      by: ['staffId'],
      where: {
        date: {
          gte: new Date(`${year}-${String(filterMonth).padStart(2, '0')}-01`),
          lt: new Date(filterMonth === 12 ? `${year + 1}-01-01` : `${year}-${String(filterMonth + 1).padStart(2, '0')}-01`),
        },
        status: 'CONFIRMED',
        staff: branchWhere,
        ...(filterStaff ? { staffId: filterStaff } : {}),
      },
      _count: { _all: true },
    }) : []
    const monthlySessionMap = new Map(monthlySessionCounts.map((s: { staffId: string; _count: { _all: number } }) => [s.staffId, s._count._all]))

    // Aggregate per-staff: avg rating, session count, text feedback
    type StaffAgg = {
      id: string; name: string; department: string; branch: string
      totalRating: number; ratingCount: number; surveyCount: number
      sessionsTotal: number; sessionsRescheduled: number; sessionsCancelled: number; sessionsMonth: number
      textFeedback: { strengths: string[]; improvements: string[]; other: string[] }
      monthlyRatings: Record<string, { total: number; count: number }>
    }
    const staffMap = new Map<string, StaffAgg>()

    for (const r of responses) {
      if (!staffMap.has(r.staffId)) {
        staffMap.set(r.staffId, {
          id: r.staffId,
          name: `${r.staff.firstName} ${r.staff.lastName}`,
          department: r.staff.department,
          branch: r.staff.branch,
          totalRating: 0, ratingCount: 0, surveyCount: 0,
          sessionsTotal: sessionMap.get(r.staffId) ?? 0,
          sessionsRescheduled: rescheduledMap.get(r.staffId) ?? 0,
          sessionsCancelled: cancelledMap.get(r.staffId) ?? 0,
          sessionsMonth: monthlySessionMap.get(r.staffId) ?? 0,
          textFeedback: { strengths: [], improvements: [], other: [] },
          monthlyRatings: {},
        })
      }
      const agg = staffMap.get(r.staffId)!
      agg.surveyCount++

      const json = r.responsesJson as Record<string, unknown> & { ratings?: { name: string; value: number }[] }

      // Aggregate ratings
      if (json?.ratings) {
        for (const rating of json.ratings) {
          agg.totalRating += rating.value
          agg.ratingCount++
        }
        // Monthly breakdown
        const month = String(r.submittedAt.getMonth() + 1).padStart(2, '0')
        if (!agg.monthlyRatings[month]) agg.monthlyRatings[month] = { total: 0, count: 0 }
        for (const rating of json.ratings) {
          agg.monthlyRatings[month].total += rating.value
          agg.monthlyRatings[month].count++
        }
      }

      // Collect text feedback (q9/q10 for HR10, q13/q14 for HR11, q10 for HR12, q11 for HR16)
      // Strengths: q9 (HR10), q13 (HR11)
      // Improvements: q10 (HR10), q14 (HR11)
      // Other: q10 (HR12), q11 (HR16)
      for (const [key, val] of Object.entries(json)) {
        if (key === 'ratings' || typeof val !== 'string' || !val.trim()) continue
        const text = val.trim()
        if (['q9', 'q13'].includes(key) && r.surveyType !== 'HR12') {
          agg.textFeedback.strengths.push(text)
        } else if (['q10', 'q14'].includes(key) && r.surveyType !== 'HR12') {
          agg.textFeedback.improvements.push(text)
        } else {
          agg.textFeedback.other.push(text)
        }
      }
    }

    // Build staff list with composite score
    const staffList = Array.from(staffMap.values()).map(s => {
      const avgRating = s.ratingCount > 0 ? s.totalRating / s.ratingCount : 0
      // Normalize: rating out of 5 (scale 0–5) → 0-1, sessions normalized against max in dataset
      return { ...s, avgRating: parseFloat(avgRating.toFixed(2)) }
    })

    // Find max values for normalization
    const maxConfirmed = Math.max(1, ...staffList.map(s => s.sessionsTotal))
    const maxRescheduled = Math.max(1, ...staffList.map(s => s.sessionsRescheduled))
    const maxCancelled = Math.max(1, ...staffList.map(s => s.sessionsCancelled))

    // Compute composite score using configurable weights
    const scored = staffList.map(s => {
      const satisfactionNorm = s.avgRating / 5 // max scale is 5 (ratings 0–5)
      const confirmedNorm = s.sessionsTotal / maxConfirmed
      // Rescheduled & cancelled are inverted: fewer = higher score
      const rescheduledNorm = 1 - (s.sessionsRescheduled / maxRescheduled)
      const cancelledNorm = 1 - (s.sessionsCancelled / maxCancelled)
      const compositeScore = parseFloat((
        (confirmedNorm * wConfirmed + rescheduledNorm * wRescheduled + cancelledNorm * wCancelled + satisfactionNorm * wSatisfaction) * 100
      ).toFixed(1))
      return { ...s, compositeScore }
    })

    // Keep everyone whose compositeScore falls within the top N distinct
    // scores. So if 5 people all tie for 1st place, they all appear in
    // "Top 5" — along with everyone in scores 2 through 5.
    function topNByDistinctScore<T extends { compositeScore: number }>(arr: T[], n: number): T[] {
      const sorted = [...arr].sort((a, b) => b.compositeScore - a.compositeScore)
      const distinct = new Set<number>()
      const out: T[] = []
      for (const row of sorted) {
        if (!distinct.has(row.compositeScore) && distinct.size >= n) break
        distinct.add(row.compositeScore)
        out.push(row)
      }
      return out
    }

    // Top 5 overall — up to 5 distinct scores, all ties included
    const top5Overall = topNByDistinctScore(scored, 5)

    // Top 5 per department — same rule, applied per dept slice
    const departments = [...new Set(scored.map(s => s.department))]
    const top5ByDept: Record<string, typeof scored> = {}
    for (const dept of departments) {
      top5ByDept[dept] = topNByDistinctScore(
        scored.filter(s => s.department === dept),
        5,
      )
    }

    // Get available branches for filter (main admin only)
    const availableBranches = resultsBranch ? [resultsBranch] : [...new Set(scored.map(s => s.branch))].sort()

    // Staff list for filter dropdown
    const staffOptions = scored.map(s => ({ id: s.id, name: s.name, department: s.department, branch: s.branch }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({
      top5Overall: top5Overall.map(s => ({
        id: s.id, name: s.name, department: s.department, branch: s.branch,
        avgRating: s.avgRating, sessionsTotal: s.sessionsTotal, compositeScore: s.compositeScore,
        surveyCount: s.surveyCount,
      })),
      top5ByDept: Object.fromEntries(
        Object.entries(top5ByDept).map(([dept, list]) => [dept, list.map(s => ({
          id: s.id, name: s.name, department: s.department, branch: s.branch,
          avgRating: s.avgRating, sessionsTotal: s.sessionsTotal, compositeScore: s.compositeScore,
          surveyCount: s.surveyCount,
        }))])
      ),
      allStaff: scored.map(s => ({
        id: s.id, name: s.name, department: s.department, branch: s.branch,
        avgRating: s.avgRating, sessionsTotal: s.sessionsTotal, sessionsRescheduled: s.sessionsRescheduled,
        sessionsCancelled: s.sessionsCancelled, sessionsMonth: s.sessionsMonth,
        compositeScore: s.compositeScore, surveyCount: s.surveyCount,
        monthlyRatings: Object.entries(s.monthlyRatings).map(([month, d]) => ({
          month, avgRating: parseFloat((d.total / d.count).toFixed(2)),
        })),
        feedback: {
          strengths: s.textFeedback.strengths.slice(0, 10),
          improvements: s.textFeedback.improvements.slice(0, 10),
          other: s.textFeedback.other.slice(0, 10),
        },
      })),
      availableBranches,
      staffOptions,
      departments: departments.sort(),
      isMainAdmin: !resultsBranch,
      weights: {
        weightConfirmed: Math.round(wConfirmed * 100),
        weightRescheduled: Math.round(wRescheduled * 100),
        weightCancelled: Math.round(wCancelled * 100),
        weightSatisfaction: Math.round(wSatisfaction * 100),
      },
    })
  }

  if (view === 'highlights') {
    // Social Media Highlights — Marketing Admin only
    const canView = ['MARKETING_ADMIN', 'SUPERADMIN', 'ADMIN'].includes(role)
    if (!canView) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const yearStart = new Date(`${year}-01-01`)
    const yearEnd = new Date(`${year + 1}-01-01`)

    const responses = await prisma.surveyResponse.findMany({
      where: { submittedAt: { gte: yearStart, lt: yearEnd } },
      include: {
        staff: { select: { firstName: true, lastName: true, department: true, branch: true } },
        assignment: { select: { patientName: true, surveyType: true } },
      },
      orderBy: { submittedAt: 'desc' },
    })

    // Extract only strengths/positive feedback with staff context
    const highlights: {
      staffName: string; department: string; branch: string
      surveyType: string; feedback: string; submittedAt: Date
      avgRating: number | null
    }[] = []

    for (const r of responses) {
      const json = r.responsesJson as Record<string, unknown> & { ratings?: { name: string; value: number }[] }

      // Calculate this survey's avg rating
      let avg: number | null = null
      if (json?.ratings && json.ratings.length > 0) {
        const sum = json.ratings.reduce((a, b) => a + b.value, 0)
        avg = parseFloat((sum / json.ratings.length).toFixed(2))
      }

      // Collect strengths: q9 for HR10, q13 for HR11, q10 for HR12, q11 for HR16
      const strengthKeys = r.surveyType === 'HR11' ? ['q13'] : r.surveyType === 'HR12' ? ['q10'] : r.surveyType === 'HR16' ? ['q11'] : ['q9']

      for (const key of strengthKeys) {
        const val = json[key]
        if (typeof val === 'string' && val.trim().length > 10) {
          highlights.push({
            staffName: `${r.staff.firstName} ${r.staff.lastName}`,
            department: r.staff.department,
            branch: r.staff.branch,
            surveyType: r.surveyType,
            feedback: val.trim(),
            submittedAt: r.submittedAt,
            avgRating: avg,
          })
        }
      }
    }

    // Sort: highest rated first, then most recent
    highlights.sort((a, b) => {
      if (a.avgRating !== null && b.avgRating !== null) return b.avgRating - a.avgRating
      return b.submittedAt.getTime() - a.submittedAt.getTime()
    })

    return NextResponse.json({
      highlights: highlights.slice(0, 50).map(h => ({
        ...h,
        submittedAt: h.submittedAt.toISOString(),
      })),
      totalCount: highlights.length,
    })
  }

  if (view === 'settings') {
    // Settings — admin only
    if (!RESULTS_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    const settings = await prisma.surveySettings.findUnique({ where: { id: 'default' } })
    return NextResponse.json(settings ?? {
      id: 'default',
      weightConfirmed: 50,
      weightRescheduled: 0,
      weightCancelled: 0,
      weightSatisfaction: 50,
    })
  }

  if (view === 'staff') {
    // Return staff with assessment progress — filtered by branch for front desk
    // Front desk users only see FRONT_DESK department staff
    const isFrontDesk = role === 'SBEA_FRONT_DESK' || role === 'SBGH_FRONT_DESK'
    const whereClause = {
      ...(userBranch ? { branch: userBranch } : {}),
      ...(isFrontDesk ? { department: 'FRONT_DESK' as const } : {}),
    }
    const staff = await prisma.staff.findMany({
      where: whereClause,
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
      const defaultTarget = 10
      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        department: s.department,
        branch: s.branch,
        jobTitle: s.jobTitle ?? null,
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
  if (staff.department === 'FRONT_DESK' || staff.jobTitle === 'front-desk-officer') {
    surveyType = 'HR12'
  } else if (sessionType === 'group') {
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

// ── PATCH /api/customer-survey — Update survey settings (admin only) ─────────

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string }).role ?? ''
  if (!RESULTS_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Only admin users can update settings' }, { status: 403 })
  }

  const { weightConfirmed, weightRescheduled, weightCancelled, weightSatisfaction } = await req.json()

  // Validate: all must be 0-100 and total must equal 100
  const weights = [weightConfirmed, weightRescheduled, weightCancelled, weightSatisfaction]
  if (weights.some((w: number) => typeof w !== 'number' || w < 0 || w > 100)) {
    return NextResponse.json({ error: 'Each weight must be between 0 and 100' }, { status: 400 })
  }
  const total = weights.reduce((a: number, b: number) => a + b, 0)
  if (total !== 100) {
    return NextResponse.json({ error: `Weights must total 100% (currently ${total}%)` }, { status: 400 })
  }

  const settings = await prisma.surveySettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', weightConfirmed, weightRescheduled, weightCancelled, weightSatisfaction },
    update: { weightConfirmed, weightRescheduled, weightCancelled, weightSatisfaction },
  })

  return NextResponse.json(settings)
}

// ── DELETE /api/customer-survey — Delete assignment + response (admin only) ──

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string }).role ?? ''
  if (!RESULTS_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Only admin users can delete survey results' }, { status: 403 })
  }

  const { assignmentId } = await req.json()
  if (!assignmentId) {
    return NextResponse.json({ error: 'assignmentId is required' }, { status: 400 })
  }

  const assignment = await prisma.surveyAssignment.findUnique({
    where: { id: assignmentId },
    include: { response: true },
  })

  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  // Branch admins can only delete within their branch
  const deleteBranch = role === 'SBEA_ADMIN' ? 'SBEA' : role === 'SBGH_ADMIN' ? 'SBGH' : null
  if (deleteBranch && assignment.branch !== deleteBranch) {
    return NextResponse.json({ error: 'You can only delete results from your branch' }, { status: 403 })
  }

  // Transaction: delete response (if exists), decrement assessment target, delete assignment
  await prisma.$transaction(async (tx) => {
    if (assignment.response) {
      await tx.surveyResponse.delete({ where: { id: assignment.response.id } })

      // Decrement assessment target
      const year = assignment.response.submittedAt.getFullYear()
      const target = await tx.assessmentTarget.findUnique({
        where: { staffId_year: { staffId: assignment.staffId, year } },
      })
      if (target && target.completed > 0) {
        await tx.assessmentTarget.update({
          where: { id: target.id },
          data: { completed: { decrement: 1 } },
        })
      }
    }

    await tx.surveyAssignment.delete({ where: { id: assignmentId } })
  })

  return NextResponse.json({ success: true })
}
