// Work-from-home pay (Hannah 2026-11-11): the payroll officer sets each
// employee's WFH days and paid hours per week in Payroll → Weekly
// Accomplishments, instead of editing timekeeping. A day is paid — hours ×
// hourly rate, as basic pay — on the employee's payslip once HR approves that
// week's accomplishment report. Unpaid days from earlier cutoffs (approved
// late) roll into the next payslip generated; a payslip's own claims are
// released and re-stamped on every regenerate, so nothing is paid twice.

import { prisma } from '@/lib/prisma'
import { fetchWeeklyAccomplishments } from '@/lib/weekly-accomplishments'

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const round2 = (n: number) => Math.round(n * 100) / 100

/** The Sunday a YYYY-MM-DD date's HR report week starts on. */
export function weekStartOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return ymd(d)
}

/**
 * Approved report weeks per HR staff id, for WFH days dated before the cutoff
 * end that are unpaid or were paid by this cutoff. null = nothing to look up,
 * or HR could not be reached (then no WFH is paid this run; regenerate later).
 */
export async function wfhApprovals(opts: { employeeIds: string[]; cutoffPeriod: string; cutoffStart: Date; cutoffEndExclusive: Date }): Promise<Map<string, Set<string>> | null> {
  if (!opts.employeeIds.length) return null
  const agg = await prisma.wfhDay.aggregate({
    _min: { date: true },
    where: {
      employeeId: { in: opts.employeeIds },
      date: { lt: ymd(opts.cutoffEndExclusive) },
      OR: [{ payslipId: null }, { paidCutoff: opts.cutoffPeriod }],
    },
  }).catch(() => null)
  const first = agg?._min.date
  if (!first) return null
  const from = first < ymd(opts.cutoffStart) ? first : ymd(opts.cutoffStart)
  const to = ymd(new Date(opts.cutoffEndExclusive.getTime() - 86_400_000))
  const res = await fetchWeeklyAccomplishments(from, to)
  if (!res.ok) { console.error('[wfh-pay] HR approvals unavailable — WFH left unpaid this run:', res.message); return null }
  const out = new Map<string, Set<string>>()
  for (const p of res.people) out.set(p.staffId, new Set(p.weeks.filter(w => w.state === 'approved').map(w => w.week)))
  return out
}

export interface WfhPay {
  days: { id: string; date: string; weekStart: string; hours: number; amount: number; earlier: boolean }[]
  hours: number
  total: number
}

/**
 * Release this payslip's WFH claims, then work out the WFH days it pays:
 * unpaid, dated before the cutoff ends, in an approved report week, and with
 * no timekeeping hours that day (a day worked on-site is already paid).
 * Caller adds `total` to basic pay and stamps the claims after the save.
 */
export async function wfhPayFor(opts: {
  emp: { id: string; externalStaffId: string | null; ignoreTimekeeping?: boolean | null }
  cutoffPeriod: string; qBranch: string; cutoffStart: Date; cutoffEndExclusive: Date
  tkDates: Set<string> // dates in this cutoff with timekeeping hours
  hourlyRate: number
  approvals: Map<string, Set<string>> | null
}): Promise<WfhPay | null> {
  const prior = await prisma.employeePayslip.findUnique({
    where: { employeeId_cutoffPeriod_branch: { employeeId: opts.emp.id, cutoffPeriod: opts.cutoffPeriod, branch: opts.qBranch } },
    select: { id: true, status: true },
  })
  if (prior?.status === 'LOCKED') return null
  if (prior) await prisma.wfhDay.updateMany({ where: { payslipId: prior.id }, data: { payslipId: null, paidCutoff: null } })
  // A fixed-salary employee is paid the same whatever days they work.
  if (opts.emp.ignoreTimekeeping || !opts.emp.externalStaffId || !opts.approvals) return null
  const approved = opts.approvals.get(opts.emp.externalStaffId)
  if (!approved?.size) return null

  const startY = ymd(opts.cutoffStart)
  const rows = await prisma.wfhDay.findMany({
    where: { employeeId: opts.emp.id, payslipId: null, date: { lt: ymd(opts.cutoffEndExclusive) } },
    orderBy: { date: 'asc' },
  })
  const due = rows.filter(r => approved.has(r.weekStart) && Number(r.hours) > 0)
  if (!due.length) return null

  // Earlier-cutoff days: a day with timekeeping hours was paid by attendance then.
  const earlier = due.filter(r => r.date < startY).map(r => r.date)
  const earlierTk = earlier.length
    ? new Set((await prisma.timekeepingRecord.findMany({
        where: { employeeId: opts.emp.id, date: { in: earlier.map(d => new Date(`${d}T00:00:00Z`)) }, hoursWorked: { gt: 0 } },
        select: { date: true },
      })).map(r => ymd(r.date)))
    : new Set<string>()

  const days = due
    .filter(r => !opts.tkDates.has(r.date) && !earlierTk.has(r.date))
    .map(r => {
      const hours = Number(r.hours)
      return { id: r.id, date: r.date, weekStart: r.weekStart, hours, amount: round2(hours * opts.hourlyRate), earlier: r.date < startY }
    })
  if (!days.length) return null
  return { days, hours: days.reduce((t, d) => t + d.hours, 0), total: round2(days.reduce((t, d) => t + d.amount, 0)) }
}

/** Stamp the WFH days a saved payslip pays (only ones still unpaid). */
export async function claimWfhDays(pay: WfhPay, cutoffPeriod: string, payslipId: string) {
  await prisma.wfhDay.updateMany({
    where: { id: { in: pay.days.map(d => d.id) }, payslipId: null },
    data: { payslipId, paidCutoff: cutoffPeriod },
  })
}
