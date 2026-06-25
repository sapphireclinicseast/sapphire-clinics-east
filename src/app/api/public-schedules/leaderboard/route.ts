import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Cookie-gated — same passcode as the schedule viewer
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get('sched_access')
  if (cookie?.value !== 'scei') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch     = searchParams.get('branch')     // e.g. SBEA
  const department = searchParams.get('department') // e.g. OT

  if (!branch || !department) {
    return NextResponse.json({ error: 'branch and department are required' }, { status: 400 })
  }

  const year      = new Date().getFullYear()
  const yearStart = new Date(`${year}-01-01`)
  const yearEnd   = new Date(`${year + 1}-01-01`)

  // Load weight settings (same as main leaderboard)
  const settings      = await prisma.surveySettings.findUnique({ where: { id: 'default' } })
  const wConfirmed    = (settings?.weightConfirmed    ?? 50) / 100
  const wRescheduled  = (settings?.weightRescheduled  ?? 0)  / 100
  const wCancelled    = (settings?.weightCancelled    ?? 0)  / 100
  const wSatisfaction = (settings?.weightSatisfaction ?? 50) / 100

  // Survey responses for this branch this year
  const responses = await prisma.surveyResponse.findMany({
    where: { submittedAt: { gte: yearStart, lt: yearEnd }, branch, staff: { active: true } },
    include: {
      staff: { select: { id: true, firstName: true, lastName: true, department: true } },
    },
  })

  // Session counts by status for this branch
  const [confirmedCounts, rescheduledCounts, cancelledCounts] = await Promise.all([
    prisma.schedule.groupBy({
      by: ['staffId'],
      where: { date: { gte: yearStart, lt: yearEnd }, status: 'CONFIRMED', staff: { branch } },
      _count: { _all: true },
    }),
    prisma.schedule.groupBy({
      by: ['staffId'],
      where: { date: { gte: yearStart, lt: yearEnd }, status: 'RESCHEDULED', staff: { branch } },
      _count: { _all: true },
    }),
    prisma.schedule.groupBy({
      by: ['staffId'],
      where: { date: { gte: yearStart, lt: yearEnd }, status: 'CANCELLED', staff: { branch } },
      _count: { _all: true },
    }),
  ])

  const sessionMap     = new Map(confirmedCounts.map((s: { staffId: string; _count: { _all: number } }) => [s.staffId, s._count._all]))
  const rescheduledMap = new Map(rescheduledCounts.map((s: { staffId: string; _count: { _all: number } }) => [s.staffId, s._count._all]))
  const cancelledMap   = new Map(cancelledCounts.map((s: { staffId: string; _count: { _all: number } }) => [s.staffId, s._count._all]))

  // Aggregate per staff
  type Agg = { id: string; name: string; dept: string; totalRating: number; ratingCount: number; surveyCount: number; confirmed: number; rescheduled: number; cancelled: number }
  const staffMap = new Map<string, Agg>()

  for (const r of responses) {
    if (!staffMap.has(r.staffId)) {
      staffMap.set(r.staffId, {
        id: r.staffId,
        name: `${r.staff.firstName} ${r.staff.lastName}`,
        dept: r.staff.department,
        totalRating: 0, ratingCount: 0, surveyCount: 0,
        confirmed:   sessionMap.get(r.staffId)     ?? 0,
        rescheduled: rescheduledMap.get(r.staffId) ?? 0,
        cancelled:   cancelledMap.get(r.staffId)   ?? 0,
      })
    }
    const agg  = staffMap.get(r.staffId)!
    agg.surveyCount++  // one survey form submitted
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

  const maxConfirmed   = Math.max(1, ...staffList.map(s => s.confirmed))
  const maxRescheduled = Math.max(1, ...staffList.map(s => s.rescheduled))
  const maxCancelled   = Math.max(1, ...staffList.map(s => s.cancelled))

  const scored = staffList.map(s => {
    const satisfactionNorm  = s.avgRating / 6
    const confirmedNorm     = s.confirmed / maxConfirmed
    const rescheduledNorm   = 1 - (s.rescheduled / maxRescheduled)
    const cancelledNorm     = 1 - (s.cancelled   / maxCancelled)
    const score = parseFloat((
      (confirmedNorm * wConfirmed + rescheduledNorm * wRescheduled + cancelledNorm * wCancelled + satisfactionNorm * wSatisfaction) * 100
    ).toFixed(1))
    return { id: s.id, name: s.name, dept: s.dept, avgRating: s.avgRating, surveyCount: s.surveyCount, score }
  }).sort((a, b) => b.score - a.score)

  // Group into the top 5 distinct scores, ties collapsed into one rank bucket
  type Entry = { id: string; name: string; dept: string; avgRating: number; surveyCount: number; score: number }
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

  const branchTop5 = groupByDistinctScore(scored, 5)
  const deptTop5   = groupByDistinctScore(scored.filter(s => s.dept === department), 5)

  return NextResponse.json({ year, branchTop5, deptTop5 })
}
