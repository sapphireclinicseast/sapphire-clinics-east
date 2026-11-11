/**
 * Payroll → Employees → Weekly Accomplishments → work-from-home days.
 *
 * GET ?cutoffPeriod=2026-11-1
 *   Hub employees linked to HR (externalStaffId) with their WFH days per week
 *   setting, and the WFH days dated in the cutoff's report weeks (Sunday of the
 *   first week through the cutoff end + 6 days), with what paid each one.
 * PUT { employeeId, wfhDaysPerWeek }   — the settings dropdown (null = not WFH).
 * POST { employeeId, weekStart, days: [{ date, hours }] }
 *   Sets that week's WFH days (replaces the unpaid ones). Paid days can't be
 *   changed — undo the payslip first. Pay comes from the payslip generator
 *   (lib/payroll/wfh-pay) once HR approves the week; timekeeping is untouched.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cutoffRange } from '@/lib/payroll-cutoff'
import { weekStartOf } from '@/lib/payroll/wfh-pay'

const READ_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'VIEWER']
const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const YMD = /^\d{4}-\d{2}-\d{2}$/
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const range = cutoffRange(new URL(req.url).searchParams.get('cutoffPeriod') || '')
  if (!range) return NextResponse.json({ error: 'cutoffPeriod (YYYY-MM-1|2) is required' }, { status: 400 })
  const from = weekStartOf(range.from)
  const to = addDays(range.to, 6)

  const [employees, days, settings] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true, externalStaffId: { not: null } },
      select: { id: true, externalStaffId: true, firstName: true, lastName: true, branch: true, wfhDaysPerWeek: true },
    }),
    prisma.wfhDay.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
      select: { id: true, employeeId: true, date: true, weekStart: true, hours: true, payslipId: true, paidCutoff: true },
    }),
    prisma.employeeSettings.findFirst({ select: { standardHoursPerDay: true } }).catch(() => null),
  ])
  return NextResponse.json({
    range,
    standardHours: settings ? Number(settings.standardHoursPerDay) || 8 : 8,
    employees: employees.map(e => ({ employeeId: e.id, staffId: e.externalStaffId, name: `${e.lastName}, ${e.firstName}`, branch: e.branch, wfhDaysPerWeek: e.wfhDaysPerWeek })),
    days: days.map(d => ({ ...d, hours: Number(d.hours) })),
  })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { employeeId, wfhDaysPerWeek } = await req.json()
  const n = wfhDaysPerWeek === null || wfhDaysPerWeek === '' ? null : Number(wfhDaysPerWeek)
  if (typeof employeeId !== 'string' || (n !== null && (!Number.isInteger(n) || n < 1 || n > 6))) {
    return NextResponse.json({ error: 'employeeId and wfhDaysPerWeek (1–6, or null for none) are required' }, { status: 400 })
  }
  const emp = await prisma.employee.update({ where: { id: employeeId }, data: { wfhDaysPerWeek: n }, select: { firstName: true, lastName: true } }).catch(() => null)
  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  await prisma.auditLog.create({
    data: { userId: session.user.id as string, action: 'UPDATE', entity: 'employee_wfh_setting', entityId: employeeId, details: { name: `${emp.firstName} ${emp.lastName}`, wfhDaysPerWeek: n } },
  })
  return NextResponse.json({ ok: true, wfhDaysPerWeek: n })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { employeeId, weekStart, days } = await req.json()
  if (typeof employeeId !== 'string' || typeof weekStart !== 'string' || !YMD.test(weekStart) || weekStartOf(weekStart) !== weekStart || !Array.isArray(days)) {
    return NextResponse.json({ error: 'employeeId, weekStart (a Sunday, YYYY-MM-DD) and days are required' }, { status: 400 })
  }
  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, firstName: true, lastName: true, wfhDaysPerWeek: true } })
  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const weekEnd = addDays(weekStart, 6)
  const clean: { date: string; hours: number }[] = []
  for (const d of days as { date?: unknown; hours?: unknown }[]) {
    const date = String(d?.date || '')
    const hours = Number(d?.hours)
    if (!YMD.test(date) || date < weekStart || date > weekEnd) return NextResponse.json({ error: `${date || 'A day'} is not in the week of ${weekStart}` }, { status: 400 })
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return NextResponse.json({ error: `Hours for ${date} must be more than 0 and at most 24` }, { status: 400 })
    if (clean.some(c => c.date === date)) return NextResponse.json({ error: `${date} is listed twice` }, { status: 400 })
    clean.push({ date, hours: Math.round(hours * 100) / 100 })
  }
  const allowed = emp.wfhDaysPerWeek || 0
  if (clean.length > allowed) {
    return NextResponse.json({ error: allowed ? `${emp.firstName} ${emp.lastName} is set to ${allowed} WFH day${allowed === 1 ? '' : 's'} a week` : `Set ${emp.firstName} ${emp.lastName}'s WFH days per week first` }, { status: 400 })
  }

  const existing = await prisma.wfhDay.findMany({ where: { employeeId, weekStart } })
  const paid = existing.filter(e => e.payslipId)
  for (const p of paid) {
    const keep = clean.find(c => c.date === p.date)
    if (!keep || keep.hours !== Number(p.hours)) {
      return NextResponse.json({ error: `${p.date} was already paid on the ${p.paidCutoff} payslip — it can't be changed here` }, { status: 409 })
    }
  }
  const byName = (session.user.name as string) || null
  await prisma.$transaction([
    prisma.wfhDay.deleteMany({ where: { employeeId, weekStart, payslipId: null, date: { notIn: clean.map(c => c.date) } } }),
    ...clean.filter(c => !paid.some(p => p.date === c.date)).map(c => prisma.wfhDay.upsert({
      where: { employeeId_date: { employeeId, date: c.date } },
      update: { hours: c.hours, weekStart, createdByName: byName },
      create: { employeeId, date: c.date, weekStart, hours: c.hours, createdByName: byName },
    })),
  ])
  await prisma.auditLog.create({
    data: { userId: session.user.id as string, action: 'UPDATE', entity: 'wfh_days', entityId: employeeId, details: { name: `${emp.firstName} ${emp.lastName}`, weekStart, days: clean } },
  })
  return NextResponse.json({ ok: true })
}
