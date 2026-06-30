import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const CADENCE: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, BIANNUALLY: 6, ANNUALLY: 12 }
const EXPENSE_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']
// main admin / accountant see all branches; branch admins see only their own.
const ROLE_BRANCHES: Record<string, string[]> = {
  ADMIN: EXPENSE_BRANCHES,
  ACCOUNTANT: EXPENSE_BRANCHES,
  BOOKKEEPER: EXPENSE_BRANCHES,
}
const BRANCH_LABEL: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERDANA' }
const WINDOW_DAYS = 5

export const dynamic = 'force-dynamic'

// UTC midnight for the given month index (year*12+month0) and day-of-month (clamped).
function occ(monthIdx: number, day: number): number {
  const y = Math.floor(monthIdx / 12), m = monthIdx % 12
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return Date.UTC(y, m, Math.min(Math.max(day, 1), lastDay))
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user.role as string) || ''
  const branches = ROLE_BRANCHES[role]
  if (!branches) return NextResponse.json({ reminders: [] })

  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

  const rows = await prisma.pettyCashEntry.findMany({
    where: { recordType: 'RECURRING', recurFrequency: { not: null }, branch: { in: branches } },
    select: {
      id: true, branch: true, requestor: true, description: true, accountTitle: true, grossAmount: true,
      recurFrequency: true, recurDeadlineDay: true, distributeMonthly: true, distributeStart: true, distributeEnd: true, date: true,
    },
  })

  const reminders: Record<string, unknown>[] = []
  for (const e of rows) {
    const cad = CADENCE[e.recurFrequency || '']
    if (!cad) continue
    // Anchor: prepaid expenses renew the month after coverage ends; others repeat from the payment/start date.
    let anchorIdx: number | null = null
    if (e.distributeMonthly && e.distributeEnd) {
      const d = new Date(e.distributeEnd); anchorIdx = d.getUTCFullYear() * 12 + d.getUTCMonth() + cad
    } else if (e.date) {
      const d = new Date(e.date); anchorIdx = d.getUTCFullYear() * 12 + d.getUTCMonth()
    } else if (e.distributeStart) {
      const d = new Date(e.distributeStart); anchorIdx = d.getUTCFullYear() * 12 + d.getUTCMonth()
    }
    if (anchorIdx == null) continue
    const day = e.recurDeadlineDay && e.recurDeadlineDay >= 1 ? e.recurDeadlineDay : 1
    // Advance to the first occurrence on/after today.
    let idx = anchorIdx, due = occ(idx, day), guard = 0
    while (due < today && guard < 1200) { idx += cad; due = occ(idx, day); guard++ }
    const daysUntil = Math.round((due - today) / 86400000)
    if (daysUntil <= WINDOW_DAYS) {
      reminders.push({
        id: e.id, branch: e.branch, branchLabel: BRANCH_LABEL[e.branch] || e.branch,
        payee: e.requestor, description: e.description, accountTitle: e.accountTitle, gross: Number(e.grossAmount),
        frequency: e.recurFrequency, distributeMonthly: e.distributeMonthly,
        nextDue: new Date(due).toISOString().slice(0, 10), daysUntil,
      })
    }
  }
  reminders.sort((a, b) => (a.daysUntil as number) - (b.daysUntil as number))
  return NextResponse.json({ reminders })
}
