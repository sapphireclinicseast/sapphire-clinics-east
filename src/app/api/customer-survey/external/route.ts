/**
 * External Customer Survey API — Bearer token auth (for HR Platform integration)
 *
 * GET  ?view=results-dashboard  — Leaderboard, staff details, composite scores
 * GET  ?view=settings           — Leaderboard weight settings
 * PATCH                         — Update leaderboard weight settings
 *
 * Env: EXTERNAL_API_KEY — shared secret token
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY

function checkAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return false
  }
  return true
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') || 'results-dashboard'
  const year = parseInt(searchParams.get('year') ?? '') || new Date().getFullYear()

  if (view === 'settings') {
    try {
      const settings = await prisma.surveySettings.findUnique({ where: { id: 'default' } })
      return NextResponse.json({
        ok: true,
        settings: settings ?? {
          id: 'default',
          weightConfirmed: 50,
          weightRescheduled: 0,
          weightCancelled: 0,
          weightSatisfaction: 50,
        },
      })
    } catch (err) {
      console.error('[external-survey] Settings query failed:', err)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }

  if (view === 'results-dashboard') {
    try {
      const filterBranch = searchParams.get('branch') || null
      const filterStaff = searchParams.get('staffId') || null
      const filterMonth = parseInt(searchParams.get('month') ?? '') || 0

      const yearStart = new Date(`${year}-01-01`)
      const yearEnd = new Date(`${year + 1}-01-01`)

      const branchWhere = filterBranch ? { branch: filterBranch } : {}

      const settings = await prisma.surveySettings.findUnique({ where: { id: 'default' } })
      const wConfirmed = (settings?.weightConfirmed ?? 50) / 100
      const wRescheduled = (settings?.weightRescheduled ?? 0) / 100
      const wCancelled = (settings?.weightCancelled ?? 0) / 100
      const wSatisfaction = (settings?.weightSatisfaction ?? 50) / 100

      const responses = await prisma.surveyResponse.findMany({
        where: {
          submittedAt: { gte: yearStart, lt: yearEnd },
          ...branchWhere,
          ...(filterStaff ? { staffId: filterStaff } : {}),
        },
        include: {
          staff: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
          assignment: { select: { patientName: true, sessionType: true } },
        },
        orderBy: { submittedAt: 'desc' },
      })

      // Session counts
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

      // Aggregate per staff
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

      const staffList = Array.from(staffMap.values()).map(s => {
        const avgRating = s.ratingCount > 0 ? s.totalRating / s.ratingCount : 0
        return { ...s, avgRating: parseFloat(avgRating.toFixed(2)) }
      })

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

      const departments = [...new Set(scored.map(s => s.department))]
      const top5ByDept: Record<string, typeof scored> = {}
      for (const dept of departments) {
        top5ByDept[dept] = scored
          .filter(s => s.department === dept)
          .sort((a, b) => b.compositeScore - a.compositeScore)
          .slice(0, 5)
      }

      const availableBranches = [...new Set(scored.map(s => s.branch))].sort()
      const staffOptions = scored.map(s => ({ id: s.id, name: s.name, department: s.department, branch: s.branch }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return NextResponse.json({
        ok: true,
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
        weights: {
          weightConfirmed: Math.round(wConfirmed * 100),
          weightRescheduled: Math.round(wRescheduled * 100),
          weightCancelled: Math.round(wCancelled * 100),
          weightSatisfaction: Math.round(wSatisfaction * 100),
        },
      })
    } catch (err) {
      console.error('[external-survey] Results query failed:', err)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invalid view parameter' }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
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

    return NextResponse.json({ ok: true, settings })
  } catch (err) {
    console.error('[external-survey] Settings update failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
