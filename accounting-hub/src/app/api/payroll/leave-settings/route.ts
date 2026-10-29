import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']

function allowedBranches(role: string): string[] | null {
  if (role === 'AHEA_ADMIN') return ['SBEA', 'VERDANA']
  if (role === 'AHGH_ADMIN') return ['SBGH', 'VERDANA']
  if (role === 'VERDANA_ADMIN') return ['VERDANA']
  return null
}

const DEFAULT_MAX_DAYS: Record<string, number> = {
  VACATION: 5,
  SICK: 5,
  EMERGENCY: 3,
  MATERNITY: 105,
  PATERNITY: 7,
  BEREAVEMENT: 3,
  UNPAID: 0,
  SIL: 5,
  BDAY: 1,
  TRAINING: 0,
}

/** Count calendar days in [startDate, endDate] inclusive, capped to the given year */
function countDaysInYear(start: Date, end: Date, year: number): number {
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd   = new Date(Date.UTC(year, 11, 31, 23, 59, 59))
  const s = new Date(Math.max(start.getTime(), yearStart.getTime()))
  const e = new Date(Math.min(end.getTime(), yearEnd.getTime()))
  if (s > e) return 0
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''
  const year   = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

  const allowed = allowedBranches(session.user.role as string)
  if (branch && allowed && !allowed.includes(branch)) {
    return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
  }

  // Load settings (singleton row)
  const settings = await prisma.employeeSettings.findFirst()
  const leaveMaxDays: Record<string, number> = {
    ...DEFAULT_MAX_DAYS,
    ...((settings?.leaveMaxDays as Record<string, number>) || {}),
  }

  // Load active employees for this branch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const empWhere: any = { isActive: true }
  if (branch) empWhere.branch = branch
  else if (allowed) empWhere.branch = { in: allowed }

  const employees = await prisma.employee.findMany({
    where: empWhere,
    select: { id: true, firstName: true, lastName: true, branch: true, department: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  // Load approved LEAVE requests for the year, scoped to these employees
  const empIds = employees.map(e => e.id)
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd   = new Date(Date.UTC(year, 11, 31, 23, 59, 59))

  const leaveRequests = await prisma.employeeRequest.findMany({
    where: {
      employeeId: { in: empIds },
      requestType: 'LEAVE',
      status: 'APPROVED',
      leaveType: { not: null },
      startDate: { lte: yearEnd },
      OR: [
        { endDate: { gte: yearStart } },
        { endDate: null, startDate: { gte: yearStart } },
      ],
    },
    select: { id: true, employeeId: true, leaveType: true, startDate: true, endDate: true, isHalfDay: true },
  })

  // Aggregate used days per employee per leave type
  const usedMap = new Map<string, Record<string, number>>()
  for (const req of leaveRequests) {
    if (!req.employeeId || !req.leaveType || !req.startDate) continue
    if (!usedMap.has(req.employeeId)) usedMap.set(req.employeeId, {})
    const empUsed = usedMap.get(req.employeeId)!
    const days = req.isHalfDay ? 0.5 : countDaysInYear(req.startDate, req.endDate ?? req.startDate, year)
    empUsed[req.leaveType] = (empUsed[req.leaveType] || 0) + days
  }

  // Maternity/paternity usage is recorded as a date range (one approved request
  // per spell) — hand those ranges to the UI so they can be shown and edited.
  const mpMap = new Map<string, { id: string; leaveType: string; startDate: string; endDate: string }[]>()
  for (const req of leaveRequests) {
    if (!req.employeeId || !req.startDate) continue
    if (req.leaveType !== 'MATERNITY' && req.leaveType !== 'PATERNITY') continue
    if (!mpMap.has(req.employeeId)) mpMap.set(req.employeeId, [])
    mpMap.get(req.employeeId)!.push({
      id: req.id, leaveType: req.leaveType,
      startDate: req.startDate.toISOString().slice(0, 10),
      endDate: (req.endDate ?? req.startDate).toISOString().slice(0, 10),
    })
  }

  const employeesWithLeave = employees.map(emp => {
    const used: Record<string, number> = usedMap.get(emp.id) || {}
    const remaining: Record<string, number> = {}
    for (const [type, max] of Object.entries(leaveMaxDays)) {
      if (max === 0) {
        remaining[type] = 0  // 0 = unlimited — no "remaining" concept
      } else {
        remaining[type] = Math.max(0, max - (used[type] || 0))
      }
    }
    return { ...emp, used, remaining, mpRanges: mpMap.get(emp.id) || [] }
  })

  return NextResponse.json({ leaveMaxDays, employees: employeesWithLeave })
}

/** Record (or edit/remove) a dated maternity/paternity leave spell.
 *  POST { employeeId, leaveType: 'MATERNITY'|'PATERNITY', startDate, endDate, requestId?, remove? }
 *  Creates/updates an APPROVED LEAVE request, which is exactly what the
 *  balance table counts — so the grid reflects it immediately. */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  const body = await req.json()
  const leaveType = String(body.leaveType || '')
  if (!['MATERNITY', 'PATERNITY'].includes(leaveType)) {
    return NextResponse.json({ error: 'Only maternity and paternity spells are recorded here' }, { status: 400 })
  }

  if (body.remove) {
    const requestId = String(body.requestId || '')
    const existing = requestId ? await prisma.employeeRequest.findUnique({ where: { id: requestId } }) : null
    if (!existing || existing.requestType !== 'LEAVE' || (existing.leaveType !== 'MATERNITY' && existing.leaveType !== 'PATERNITY')) {
      return NextResponse.json({ error: 'Leave record not found' }, { status: 404 })
    }
    await prisma.employeeRequest.delete({ where: { id: existing.id } })
    return NextResponse.json({ ok: true, removed: existing.id })
  }

  const employeeId = String(body.employeeId || '')
  const start = new Date(`${String(body.startDate || '')}T00:00:00Z`)
  const end = new Date(`${String(body.endDate || '')}T00:00:00Z`)
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return NextResponse.json({ error: 'Choose a valid from/to date range' }, { status: 400 })
  }
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, branch: true } })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  const allowed = allowedBranches(session.user.role as string)
  if (allowed && !allowed.includes(employee.branch)) {
    return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
  }

  const data = {
    leaveType: leaveType as 'MATERNITY' | 'PATERNITY',
    startDate: start, endDate: end,
    status: 'APPROVED' as const,
    reason: body.reason ? String(body.reason).slice(0, 300) : `${leaveType === 'MATERNITY' ? 'Maternity' : 'Paternity'} leave recorded from the leave balances table`,
  }
  if (body.requestId) {
    const existing = await prisma.employeeRequest.findUnique({ where: { id: String(body.requestId) } })
    if (!existing || existing.employeeId !== employeeId || existing.requestType !== 'LEAVE') {
      return NextResponse.json({ error: 'Leave record not found' }, { status: 404 })
    }
    const updated = await prisma.employeeRequest.update({ where: { id: existing.id }, data })
    return NextResponse.json({ ok: true, id: updated.id })
  }
  const created = await prisma.employeeRequest.create({
    data: { employeeId, requestType: 'LEAVE', reviewedById: session.user.id ?? null, ...data },
  })
  return NextResponse.json({ ok: true, id: created.id })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { leaveMaxDays } = await req.json()
  if (!leaveMaxDays || typeof leaveMaxDays !== 'object') {
    return NextResponse.json({ error: 'Invalid leaveMaxDays' }, { status: 400 })
  }

  // Upsert settings (singleton row)
  const existing = await prisma.employeeSettings.findFirst()
  if (existing) {
    await prisma.employeeSettings.update({ where: { id: existing.id }, data: { leaveMaxDays } })
  } else {
    await prisma.employeeSettings.create({ data: { leaveMaxDays } })
  }

  return NextResponse.json({ ok: true })
}
