import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Public — no auth required (used by TV queue display)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch')?.toUpperCase() // SBEA | SBGH

  const year = new Date().getFullYear()
  const yearStart = new Date(`${year}-01-01`)
  const yearEnd = new Date(`${year + 1}-01-01`)
  const branchWhere = branch ? { branch } : {}

  // Load weight settings
  const settings = await prisma.surveySettings.findUnique({ where: { id: 'default' } })
  const wConfirmed = (settings?.weightConfirmed ?? 50) / 100
  const wRescheduled = (settings?.weightRescheduled ?? 0) / 100
  const wCancelled = (settings?.weightCancelled ?? 0) / 100
  const wSatisfaction = (settings?.weightSatisfaction ?? 50) / 100

  // Get survey responses for the year
  const responses = await prisma.surveyResponse.findMany({
    where: {
      submittedAt: { gte: yearStart, lt: yearEnd },
      ...branchWhere,
    },
    include: {
      staff: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
    },
  })

  // Get session counts by status
  const [confirmedCounts, rescheduledCounts, cancelledCounts] = await Promise.all([
    prisma.schedule.groupBy({
      by: ['staffId'],
      where: { date: { gte: yearStart, lt: yearEnd }, status: 'CONFIRMED', staff: branchWhere },
      _count: { _all: true },
    }),
    prisma.schedule.groupBy({
      by: ['staffId'],
      where: { date: { gte: yearStart, lt: yearEnd }, status: 'RESCHEDULED', staff: branchWhere },
      _count: { _all: true },
    }),
    prisma.schedule.groupBy({
      by: ['staffId'],
      where: { date: { gte: yearStart, lt: yearEnd }, status: 'CANCELLED', staff: branchWhere },
      _count: { _all: true },
    }),
  ])

  const sessionMap = new Map(confirmedCounts.map((s: { staffId: string; _count: { _all: number } }) => [s.staffId, s._count._all]))
  const rescheduledMap = new Map(rescheduledCounts.map((s: { staffId: string; _count: { _all: number } }) => [s.staffId, s._count._all]))
  const cancelledMap = new Map(cancelledCounts.map((s: { staffId: string; _count: { _all: number } }) => [s.staffId, s._count._all]))

  // Aggregate per staff
  type Agg = { id: string; name: string; dept: string; branch: string; totalRating: number; ratingCount: number; confirmed: number; rescheduled: number; cancelled: number }
  const staffMap = new Map<string, Agg>()

  for (const r of responses) {
    if (!staffMap.has(r.staffId)) {
      staffMap.set(r.staffId, {
        id: r.staffId,
        name: `${r.staff.firstName} ${r.staff.lastName}`,
        dept: r.staff.department,
        branch: r.staff.branch,
        totalRating: 0, ratingCount: 0,
        confirmed: sessionMap.get(r.staffId) ?? 0,
        rescheduled: rescheduledMap.get(r.staffId) ?? 0,
        cancelled: cancelledMap.get(r.staffId) ?? 0,
      })
    }
    const agg = staffMap.get(r.staffId)!
    const json = r.responsesJson as { ratings?: { value: number }[] }
    if (json?.ratings) {
      for (const rating of json.ratings) {
        agg.totalRating += rating.value
        agg.ratingCount++
      }
    }
  }

  const staffList = Array.from(staffMap.values()).map(s => ({
    ...s,
    avgRating: s.ratingCount > 0 ? parseFloat((s.totalRating / s.ratingCount).toFixed(2)) : 0,
  }))

  const maxConfirmed = Math.max(1, ...staffList.map(s => s.confirmed))
  const maxRescheduled = Math.max(1, ...staffList.map(s => s.rescheduled))
  const maxCancelled = Math.max(1, ...staffList.map(s => s.cancelled))

  const scored = staffList.map(s => {
    const satisfactionNorm = s.avgRating / 6
    const confirmedNorm = s.confirmed / maxConfirmed
    const rescheduledNorm = 1 - (s.rescheduled / maxRescheduled)
    const cancelledNorm = 1 - (s.cancelled / maxCancelled)
    const score = parseFloat((
      (confirmedNorm * wConfirmed + rescheduledNorm * wRescheduled + cancelledNorm * wCancelled + satisfactionNorm * wSatisfaction) * 100
    ).toFixed(1))
    return { id: s.id, name: s.name, dept: s.dept, branch: s.branch, avgRating: s.avgRating, sessions: s.confirmed, score }
  })

  // Group into the top 5 distinct scores, ties collapsed into one rank bucket
  type Entry = { id: string; name: string; dept: string; branch: string; avgRating: number; sessions: number; score: number }
  type RankGroup = { rank: number; score: number; members: Entry[] }

  function groupByDistinctScore(rows: Entry[], n: number): RankGroup[] {
    const sorted = [...rows].sort((a, b) => b.score - a.score)
    const groups: RankGroup[] = []
    const distinctScores: number[] = []
    for (const r of sorted) {
      if (distinctScores.length === 0 || r.score !== distinctScores[distinctScores.length - 1]) {
        if (distinctScores.length >= n) break
        distinctScores.push(r.score)
        groups.push({ rank: distinctScores.length, score: r.score, members: [r] })
      } else {
        groups[groups.length - 1].members.push(r)
      }
    }
    return groups
  }

  const departments = [...new Set(scored.map(s => s.dept))].sort()
  const byDept: Record<string, RankGroup[]> = {}
  for (const dept of departments) {
    byDept[dept] = groupByDistinctScore(scored.filter(s => s.dept === dept), 5)
  }

  return NextResponse.json({
    year,
    byDept,
    departments,
  })
}
