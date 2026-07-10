// Scholar remittance reminders — the next unpaid scheduled month per award
// whose deposit day falls within the next 3 days (or is already overdue).
// Powers the near-due popup/card for ADMIN / ACCOUNTANT / BOOKKEEPER.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { scheduleMonths, releaseDate, mkLabel } from '@/lib/scholars'

export const dynamic = 'force-dynamic'

const ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const LEAD_DAYS = 3
const DAY = 86400000
const num = (v: unknown) => Number(v || 0)

export async function GET() {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ reminders: [] })

  const [awards, releases] = await Promise.all([
    prisma.scholarAward.findMany(),
    prisma.scholarRelease.findMany({ select: { awardId: true, monthKey: true } }),
  ])
  const paid = new Set(releases.map(r => `${r.awardId}::${r.monthKey}`))

  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const horizon = today + LEAD_DAYS * DAY

  const reminders: Record<string, unknown>[] = []
  for (const a of awards) {
    const months = scheduleMonths(a.startMonth, a.numberOfMonths)
    // earliest unpaid scheduled month
    const nextMk = months.find(mk => !paid.has(`${a.id}::${mk}`))
    if (!nextMk) continue
    const due = releaseDate(nextMk, a.releaseDay).getTime()
    if (due > horizon) continue // not near due yet
    reminders.push({
      awardId: a.id,
      name: a.scholarName,
      school: a.school,
      scholarshipType: a.scholarshipType,
      monthKey: nextMk,
      label: mkLabel(nextMk),
      amount: num(a.monthlyAmount),
      nextDue: new Date(due).toISOString().slice(0, 10),
      daysUntil: Math.round((due - today) / DAY),
    })
  }
  reminders.sort((x, y) => (x.daysUntil as number) - (y.daysUntil as number))
  return NextResponse.json({ reminders })
}
