/**
 * External Peer Evaluation API — Bearer token auth (for HR Platform integration)
 *
 * GET ?view=results-dashboard  — Leaderboard + staff details from peer-eval responses
 *   Query: year, branch (SBEA|SBGH), staffId (assessee), formType (optional)
 *
 * Mirrors /api/customer-survey/external so the HR Platform can surface peer
 * evaluation the same way it surfaces the customer survey. Scores are pooled
 * and anonymized (no assessor identities, no per-response attribution).
 *
 * Env: EXTERNAL_API_KEY — shared secret token (same as customer survey)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY

function checkAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) return false
  return true
}

/** Mean of the numeric values in a scores JSON map ({ q1: 4, q2: 5, ... }). */
function responseAvg(scores: unknown): number | null {
  if (!scores || typeof scores !== 'object') return null
  const nums = Object.values(scores as Record<string, unknown>)
    .map(v => Number(v))
    .filter(n => Number.isFinite(n))
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') || 'results-dashboard'
  if (view !== 'results-dashboard') {
    return NextResponse.json({ error: 'Invalid view parameter' }, { status: 400 })
  }

  try {
    const year = parseInt(searchParams.get('year') ?? '') || new Date().getFullYear()
    const filterBranch = searchParams.get('branch') || null
    const filterStaff = searchParams.get('staffId') || null
    const filterFormType = searchParams.get('formType') || null

    const yearStart = new Date(`${year}-01-01`)
    const yearEnd = new Date(`${year + 1}-01-01`)

    const responses = await prisma.peerEvalResponse.findMany({
      where: {
        submittedAt: { gte: yearStart, lt: yearEnd },
        ...(filterBranch ? { branch: filterBranch } : {}),
        ...(filterStaff ? { assesseeId: filterStaff } : {}),
        ...(filterFormType ? { formType: filterFormType as never } : {}),
      },
      include: {
        assessee: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
      },
      orderBy: { submittedAt: 'desc' },
    })

    type StaffAgg = {
      id: string; name: string; department: string; branch: string
      totalScore: number; responseCount: number
      strengths: string[]; improvements: string[]
      monthly: Record<string, { total: number; count: number }>
    }
    const staffMap = new Map<string, StaffAgg>()

    for (const r of responses) {
      const avg = responseAvg(r.scores)
      if (avg == null) continue
      if (!staffMap.has(r.assesseeId)) {
        staffMap.set(r.assesseeId, {
          id: r.assesseeId,
          name: `${r.assessee.firstName} ${r.assessee.lastName}`,
          department: r.assessee.department,
          branch: r.assessee.branch,
          totalScore: 0, responseCount: 0,
          strengths: [], improvements: [],
          monthly: {},
        })
      }
      const agg = staffMap.get(r.assesseeId)!
      agg.totalScore += avg
      agg.responseCount++
      if (r.strengths && r.strengths.trim()) agg.strengths.push(r.strengths.trim())
      if (r.improvements && r.improvements.trim()) agg.improvements.push(r.improvements.trim())
      const month = String(r.submittedAt.getMonth() + 1).padStart(2, '0')
      if (!agg.monthly[month]) agg.monthly[month] = { total: 0, count: 0 }
      agg.monthly[month].total += avg
      agg.monthly[month].count++
    }

    // Score out of 5 → composite out of 100 (for ranking).
    const scored = Array.from(staffMap.values()).map(s => {
      const avgScore = s.responseCount > 0 ? s.totalScore / s.responseCount : 0
      return {
        ...s,
        avgScore: parseFloat(avgScore.toFixed(2)),
        compositeScore: parseFloat(((avgScore / 5) * 100).toFixed(1)),
      }
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
    const staffOptions = scored
      .map(s => ({ id: s.id, name: s.name, department: s.department, branch: s.branch }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const slim = (s: typeof scored[number]) => ({
      id: s.id, name: s.name, department: s.department, branch: s.branch,
      avgScore: s.avgScore, compositeScore: s.compositeScore, responseCount: s.responseCount,
    })

    return NextResponse.json({
      ok: true,
      top5Overall: top5Overall.map(slim),
      top5ByDept: Object.fromEntries(Object.entries(top5ByDept).map(([d, list]) => [d, list.map(slim)])),
      allStaff: scored.map(s => ({
        ...slim(s),
        monthlyScores: Object.entries(s.monthly).map(([month, d]) => ({
          month, avgScore: parseFloat((d.total / d.count).toFixed(2)),
        })).sort((a, b) => a.month.localeCompare(b.month)),
        feedback: {
          strengths: s.strengths.slice(0, 15),
          improvements: s.improvements.slice(0, 15),
        },
      })),
      availableBranches,
      staffOptions,
      departments: departments.sort(),
    })
  } catch (err) {
    console.error('[external-peer-eval] Results query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
