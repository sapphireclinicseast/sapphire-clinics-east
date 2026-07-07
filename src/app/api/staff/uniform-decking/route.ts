/**
 * Uniform Order — staff + decking day-count (Bearer token auth)
 *
 * Used by the HR Platform "Uniform Order" form to list active staff by
 * classification and, for consultants, how many days per week they report to
 * the clinic (from their decking config). Returns NO PII (no gov IDs / bank).
 *
 * Env: EXTERNAL_API_KEY — shared secret token (same as other /external routes).
 * Query: ?classification=consultant|employee  (optional; defaults to both)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY || ''

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const classification = searchParams.get('classification')?.toLowerCase() // consultant | employee
  const branch = searchParams.get('branch')?.toUpperCase()                 // SBEA | SBGH (optional)

  try {
    const staff = await prisma.staff.findMany({
      where: {
        active: true,
        ...(branch ? { branch } : {}),
        ...(classification === 'consultant' || classification === 'employee'
          ? { employmentType: classification }
          : { employmentType: { in: ['consultant', 'employee'] } }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        department: true,
        branch: true,
        employmentType: true,
        deckingConfig: { select: { workDays: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    const BRANCH_LABEL: Record<string, string> = { SBEA: 'AHEA', SBGH: 'AHGH' }

    // A consultant who works both branches has one Staff row per branch — merge
    // them into a single person so the name is counted once, and their total
    // days/week is the UNION of days across branches (this drives entitlement).
    type Group = {
      id: string
      firstName: string
      lastName: string
      department: string
      employmentType: string
      branches: Set<string>
      workDays: Set<string>
    }
    const groups = new Map<string, Group>()
    for (const s of staff) {
      const key = `${s.lastName}|${s.firstName}`.toUpperCase().trim()
      let g = groups.get(key)
      if (!g) {
        g = {
          id: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          department: s.department,
          employmentType: s.employmentType || '',
          branches: new Set<string>(),
          workDays: new Set<string>(),
        }
        groups.set(key, g)
      }
      if (s.branch) g.branches.add(s.branch)
      if (!g.employmentType && s.employmentType) g.employmentType = s.employmentType
      const raw = s.deckingConfig?.workDays
      if (Array.isArray(raw)) {
        for (const d of raw as unknown[]) {
          const up = String(d).toUpperCase()
          if (DAY_ORDER.includes(up)) g.workDays.add(up)
        }
      }
    }

    const items = [...groups.values()]
      .map((g) => {
        const workDays = [...g.workDays].sort(
          (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)
        )
        const branches = [...g.branches]
        const branchLabel = branches.map((b) => BRANCH_LABEL[b] || b).join(' & ')
        return {
          id: g.id,
          firstName: g.firstName,
          lastName: g.lastName,
          name: `${g.lastName}, ${g.firstName}`,
          department: g.department,
          branches,
          branchLabel,
          employmentType: g.employmentType,
          workDays,
          daysPerWeek: workDays.length,
        }
      })
      .sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName) ||
          a.firstName.localeCompare(b.firstName)
      )

    return NextResponse.json({ ok: true, staff: items })
  } catch (err) {
    console.error('[staff/uniform-decking] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
