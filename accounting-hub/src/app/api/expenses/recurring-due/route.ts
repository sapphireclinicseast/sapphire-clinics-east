import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
const CADENCE: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, BIANNUALLY: 6, ANNUALLY: 12 }
const WINDOW_DAYS = 15

function occ(monthIdx: number, day: number): number {
  const y = Math.floor(monthIdx / 12), m = monthIdx % 12
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return Date.UTC(y, m, Math.min(Math.max(day, 1), lastDay))
}

// GET /api/expenses/recurring-due?branch=
// Non-distributed recurring "setups" whose next deadline is near — to be entered
// as One-time expenses. (Distributed/prepaid ones are excluded; they auto-amortize.)
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const branch = new URL(req.url).searchParams.get('branch') || ''
  if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })

  const rows = await prisma.pettyCashEntry.findMany({
    where: { branch, recordType: 'RECURRING', distributeMonthly: false, recurFrequency: { not: null } },
    select: {
      id: true, requestor: true, department: true, accountTitle: true, description: true, grossAmount: true,
      vatable: true, siNumber: true, tinNumber: true, registeredName: true, registeredAddress: true,
      recurFrequency: true, recurDeadlineDay: true, date: true, amountVaries: true,
    },
    orderBy: { pcvSeq: 'asc' },
  })

  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const due: Record<string, unknown>[] = []
  for (const e of rows) {
    const cad = CADENCE[e.recurFrequency || '']
    if (!cad) continue
    const anchor = e.date ? new Date(e.date) : null
    if (!anchor) continue
    const day = e.recurDeadlineDay && e.recurDeadlineDay >= 1 ? e.recurDeadlineDay : 1
    let idx = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth()
    let nextDue = occ(idx, day), guard = 0
    while (nextDue < today && guard < 1200) { idx += cad; nextDue = occ(idx, day); guard++ }
    const daysUntil = Math.round((nextDue - today) / 86400000)
    if (daysUntil <= WINDOW_DAYS) {
      due.push({
        id: e.id, payee: e.requestor, accountTitle: e.accountTitle, description: e.description,
        grossAmount: Number(e.grossAmount), frequency: e.recurFrequency, amountVaries: e.amountVaries,
        nextDue: new Date(nextDue).toISOString().slice(0, 10), daysUntil,
      })
    }
  }
  due.sort((a, b) => (a.daysUntil as number) - (b.daysUntil as number))
  return NextResponse.json({ due })
}
