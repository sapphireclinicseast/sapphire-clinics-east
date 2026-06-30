import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

function allowedBranches(role: string): string[] | null {
  if (role === 'SBEA_ADMIN') return ['SBEA', 'VERDANA']
  if (role === 'SBGH_ADMIN') return ['SBGH', 'VERDANA']
  if (role === 'VERDANA_ADMIN') return ['VERDANA']
  return null
}

// POST /api/payroll/timekeeping/resync-holidays  { branch, startDate, endDate }
// Re-marks each timekeeping record's holiday flags from the branch-filtered
// Holiday table, so a holiday tagged for another branch is cleared without
// re-uploading. Branch-specific holidays win over all-branches ones on a date.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { branch, startDate, endDate } = await req.json()
  const qBranch = branch === 'SANDBOX_EAST' ? 'SBEA' : branch === 'SANDBOX_GREENHILLS' ? 'SBGH' : branch
  if (!qBranch) return NextResponse.json({ error: 'branch is required' }, { status: 400 })

  const allowed = allowedBranches(session.user.role as string)
  if (allowed && !allowed.includes(qBranch)) {
    return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { employee: { branch: qBranch } }
  if (startDate || endDate) {
    where.date = {}
    if (startDate) where.date.gte = new Date(startDate)
    if (endDate) where.date.lte = new Date(endDate)
  }
  const records = await prisma.timekeepingRecord.findMany({
    where, select: { id: true, date: true, isHoliday: true, holidayType: true },
  })
  if (records.length === 0) return NextResponse.json({ updated: 0 })

  const min = new Date(Math.min(...records.map(r => r.date.getTime())))
  const max = new Date(Math.max(...records.map(r => r.date.getTime()))); max.setUTCDate(max.getUTCDate() + 1)
  const hols = await prisma.holiday.findMany({
    where: { date: { gte: min, lt: max }, OR: [{ branch: null }, { branch: qBranch }] },
  })
  const byDate = new Map<string, { type: string; branchSpecific: boolean }>()
  for (const h of hols) {
    const k = h.date.toISOString().substring(0, 10)
    const ex = byDate.get(k)
    if (!ex || (h.branch && !ex.branchSpecific)) byDate.set(k, { type: h.holidayType, branchSpecific: !!h.branch })
  }

  const toClear: string[] = []
  const toSet: Record<string, string[]> = {}
  for (const r of records) {
    const desired = byDate.get(r.date.toISOString().substring(0, 10)) || null
    if (!desired && r.isHoliday) toClear.push(r.id)
    else if (desired && (!r.isHoliday || r.holidayType !== desired.type)) (toSet[desired.type] ||= []).push(r.id)
  }

  let updated = 0
  if (toClear.length) {
    await prisma.timekeepingRecord.updateMany({ where: { id: { in: toClear } }, data: { isHoliday: false, holidayType: null } })
    updated += toClear.length
  }
  for (const [type, ids] of Object.entries(toSet)) {
    await prisma.timekeepingRecord.updateMany({ where: { id: { in: ids } }, data: { isHoliday: true, holidayType: type } })
    updated += ids.length
  }
  return NextResponse.json({ updated })
}
