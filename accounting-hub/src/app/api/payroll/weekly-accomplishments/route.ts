/**
 * Payroll → Employees → Weekly Accomplishments.
 *
 * GET ?cutoffPeriod=2026-11-1&branch=SBEA (branch optional)
 *   Each reporting employee's weeks inside the cutoff, with whether their WFH
 *   is cleared. Read-only: approvals happen in the HR Platform.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { cutoffRange } from '@/lib/payroll-cutoff'
import { fetchWeeklyAccomplishments } from '@/lib/weekly-accomplishments'

const READ_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'VIEWER']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const cutoffPeriod = searchParams.get('cutoffPeriod') || ''
  const branch = searchParams.get('branch') || ''
  const range = cutoffRange(cutoffPeriod)
  if (!range) return NextResponse.json({ error: 'cutoffPeriod (YYYY-MM-1|2) is required' }, { status: 400 })

  const result = await fetchWeeklyAccomplishments(range.from, range.to, branch || undefined)
  if (!result.ok) return NextResponse.json({ error: result.message, range }, { status: 502 })

  const order = { hold: 0, 'in-progress': 1, cleared: 2 }
  const people = result.people.sort((a, b) => order[a.clearance] - order[b.clearance] || a.name.localeCompare(b.name))
  return NextResponse.json({ range, people })
}
