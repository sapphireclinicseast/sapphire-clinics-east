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
    const items = staff.map((s) => {
      const raw = s.deckingConfig?.workDays
      const workDays = Array.isArray(raw)
        ? (raw as unknown[])
            .map((d) => String(d).toUpperCase())
            .filter((d) => DAY_ORDER.includes(d))
        : []
      workDays.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
      return {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        name: `${s.lastName}, ${s.firstName}`,
        department: s.department,
        branch: s.branch,
        employmentType: s.employmentType || '',
        workDays,
        daysPerWeek: workDays.length,
      }
    })

    return NextResponse.json({ ok: true, staff: items })
  } catch (err) {
    console.error('[staff/uniform-decking] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
