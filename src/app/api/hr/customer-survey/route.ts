import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ── Public API for HR Platform — authenticated via X-HR-Key header ──────────
// Serves: leaderboard, staff details, settings (read + write)

const HR_API_KEY = process.env.HR_API_KEY || 'scei-hr-survey-key-2026'

function checkKey(req: NextRequest) {
  const key = req.headers.get('x-hr-key')
  return key === HR_API_KEY
}

// ── GET /api/hr/customer-survey?view=leaderboard|staff|settings ─────────────
export async function GET(req: NextRequest) {
  if (!checkKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view')
  const year = parseInt(searchParams.get('year') ?? '') || new Date().getFullYear()

  // ── Leaderboard (results-dashboard) ─────────────────────────────────────
  if (view === 'leaderboard') {
    const filterBranch = searchParams.get('branch') || null
    const filterStaff = searchParams.get('staffId') || null

    const yearStart = new Date(`${year}-01-01`)
    const yearEnd = new Date(`${year + 1}-01-01`)
    const branchWhere = filterBranch ? { branch: filterBranch } : {}

    const responses = await prisma.surveyResponse.findMany({
      where: {
        submittedAt: { gte: yearStart, lt: yearEnd },
        ...branchWhere,
        ...(filterStaff ? { staffId: filterStaff } : {}),
      },
      include: {
        staff: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
      },
      orderBy: { submittedAt: 'desc' },
    })

    const settings = await prisma.surveySettings.findUnique({ where: { id: 'default' } })
    const wConfirmed = (settings?.weightConfirmed ?? 50) / 100
    const wRescheduled = (settings?.weightRescheduled ?? 0) / 100
    const wCancelled = (settings?.weightCancelled ?? 0) / 100
    const wSatisfaction = (settings?.weightSatisfaction ?? 50) / 100

    const [confirmedCounts, rescheduledCounts, cancelledCounts] = await Promise.all([
      prisma.schedule.groupBy({
        by: ['staffId'],
        where: { date: { gte: yearStart, lt: yearEnd }, status: 'CONFIRMED', staff: branchWhere, ...(filterStaff ? { staffId: filterStaff } : {}) },
        _count: { _all: true },
      }),
      prisma.schedule.groupBy({
        by: ['staffId'],
        where: { date: { gte: yearStart, lt: yearEnd }, status: 'RESCHEDULED', staff: branchWhere, ...(filterStaff ? { staffId: filterStaff } : {}) },
        _count: { _all: true },
      }),
      prisma.schedule.groupBy({
        by: ['staffId'],
        where: { date: { gte: yearStart, lt: yearEnd }, status: 'CANCELLED', staff: branchWhere, ...(filterStaff ? { staffId: filterStaff } : {}) },
        _count: { _all: true },
      }),
    ])

    const sessionMap = new Map(confirmedCounts.map((s: { staffId: string; _count: { _all: number } }) => [s.staffId, s._count._all]))
    const rescheduledMap = new Map(rescheduledCounts.map((s: { staffId: string; _count: { _all: number } }) => [s.staffId, s._count._all]))
    const cancelledMap = new Map(cancelledCounts.map((s: { staffId: string; _count: { _all: number } }) => [s.staffId, s._count._all]))

    type StaffAgg = {
      id: string; name: string; department: string; branch: string
      totalRating: number; ratingCount: number; surveyCount: number
      sessionsTotal: number; sessionsRescheduled: number; sessionsCancelled: number
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
          textFeedback: { strengths: [], improvements: [], other: [] },
          monthlyRatings: {},
        })
      }
      const agg = staffMap.get(r.staffId)!
      agg.surveyCount++

      const json = r.responsesJson as Record<string, unknown> & { ratings?: { name: string; value: number }[] }
      if (json?.ratings) {
        for (const rating of json.ratings) {
          agg.totalRating += rating.value
          agg.ratingCount++
        }
        const month = String(r.submittedAt.getMonth() + 1).padStart(2, '0')
        if (!agg.monthlyRatings[month]) agg.monthlyRatings[month] = { total: 0, count: 0 }
        for (const rating of json.ratings) {
          agg.monthlyRatings[month].total += rating.value
          agg.monthlyRatings[month].count++
        }
      }

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

    const staffList = Array.from(staffMap.values()).map(s => ({
      ...s,
      avgRating: s.ratingCount > 0 ? parseFloat((s.totalRating / s.ratingCount).toFixed(2)) : 0,
    }))

    const maxConfirmed = Math.max(1, ...staffList.map(s => s.sessionsTotal))
    const maxRescheduled = Math.max(1, ...staffList.map(s => s.sessionsRescheduled))
    const maxCancelled = Math.max(1, ...staffList.map(s => s.sessionsCancelled))

    const scored = staffList.map(s => {
      const satisfactionNorm = s.avgRating / 6
      const confirmedNorm = s.sessionsTotal / maxConfirmed
      const rescheduledNorm = 1 - (s.sessionsRescheduled / maxRescheduled)
      const cancelledNorm = 1 - (s.sessionsCancelled / maxCancelled)
      const compositeScore = parseFloat((
        (confirmedNorm * wConfirmed + rescheduledNorm * wRescheduled + cancelledNorm * wCancelled + satisfactionNorm * wSatisfaction) * 100
      ).toFixed(1))
      return { ...s, compositeScore }
    })

    const top5Overall = [...scored].sort((a, b) => b.compositeScore - a.compositeScore).slice(0, 5)
    const departments = [...new Set(scored.map(s => s.department))].sort()
    const top5ByDept: Record<string, typeof top5Overall> = {}
    for (const dept of departments) {
      top5ByDept[dept] = scored.filter(s => s.department === dept).sort((a, b) => b.compositeScore - a.compositeScore).slice(0, 5)
    }

    const availableBranches = [...new Set(scored.map(s => s.branch))].sort()
    const staffOptions = scored.map(s => ({ id: s.id, name: s.name, department: s.department, branch: s.branch }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({
      top5Overall: top5Overall.map(s => ({
        id: s.id, name: s.name, department: s.department, branch: s.branch,
        avgRating: s.avgRating, sessionsTotal: s.sessionsTotal, compositeScore: s.compositeScore, surveyCount: s.surveyCount,
      })),
      top5ByDept: Object.fromEntries(
        Object.entries(top5ByDept).map(([dept, list]) => [dept, list.map(s => ({
          id: s.id, name: s.name, department: s.department, branch: s.branch,
          avgRating: s.avgRating, sessionsTotal: s.sessionsTotal, compositeScore: s.compositeScore, surveyCount: s.surveyCount,
        }))])
      ),
      allStaff: scored.map(s => ({
        id: s.id, name: s.name, department: s.department, branch: s.branch,
        avgRating: s.avgRating, sessionsTotal: s.sessionsTotal, sessionsRescheduled: s.sessionsRescheduled,
        sessionsCancelled: s.sessionsCancelled,
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
      departments,
      weights: {
        weightConfirmed: Math.round(wConfirmed * 100),
        weightRescheduled: Math.round(wRescheduled * 100),
        weightCancelled: Math.round(wCancelled * 100),
        weightSatisfaction: Math.round(wSatisfaction * 100),
      },
    })
  }

  // ── Staff details ───────────────────────────────────────────────────────
  if (view === 'staff') {
    const filterBranch = searchParams.get('branch') || null
    const whereClause = filterBranch ? { branch: filterBranch } : {}

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
      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        department: s.department,
        branch: s.branch,
        jobTitle: s.jobTitle ?? null,
        targetCount: target?.targetCount ?? 10,
        completed: target?.completed ?? 0,
        lastAssessed: s.surveyResponses[0]?.submittedAt ?? null,
      }
    }))
  }

  // ── Settings ────────────────────────────────────────────────────────────
  if (view === 'settings') {
    const settings = await prisma.surveySettings.findUnique({ where: { id: 'default' } })
    return NextResponse.json(settings ?? {
      id: 'default',
      weightConfirmed: 50,
      weightRescheduled: 0,
      weightCancelled: 0,
      weightSatisfaction: 50,
    })
  }

  return NextResponse.json({ error: 'Invalid view parameter' }, { status: 400 })
}

// ── PATCH /api/hr/customer-survey — Update scoring weights ──────────────────
export async function PATCH(req: NextRequest) {
  if (!checkKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { weightConfirmed, weightRescheduled, weightCancelled, weightSatisfaction } = await req.json()

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
