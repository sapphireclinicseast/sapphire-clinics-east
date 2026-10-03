/**
 * /api/payroll/special-runs — 13th-month, maternity and final-pay runs.
 *
 * See src/lib/payroll/special-runs.ts for why these are EmployeePayslip rows
 * with a suffixed cutoffPeriod. This route only COMPUTES and SAVES DRAFTS;
 * finalising, locking, journal posting and unlocking go through the existing
 * payroll endpoints (PUT /api/payroll/employee-payslips and
 * /api/payroll/finalize), so a special run is posted and paid exactly like a
 * regular cutoff.
 *
 *   GET  ?year=&branch=                         saved runs for the year
 *   GET  ?employees=1&branch=                   employee picker (active + inactive)
 *   GET  ?compute=THIRTEENTH&year=&month=&branch=   13th-month worksheet, all active employees
 *   GET  ?compute=FINAL&employeeId=&year=&month=    final-pay worksheet for one employee
 *   GET  ?compute=MATERNITY&employeeId=             maternity worksheet for one employee
 *   POST { type, year, month, payDate?, rows[] }    save / replace DRAFT runs
 *   DELETE ?id=                                     delete a DRAFT or FINAL (not LOCKED) run
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  SpecialRunType, SpecialLine, SpecialDeduction, SPECIAL_LABEL, classifyLines, marginalTax, isRegularCutoff,
  parseSpecialPeriod, specialPeriod, r2, LEAVE_CONVERSION_EXEMPT_DAYS, THIRTEENTH_EXEMPT_CEILING,
} from '@/lib/payroll/special-runs'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']
const TYPES: SpecialRunType[] = ['THIRTEENTH', 'MATERNITY', 'FINAL']

function allowedBranches(role: string): string[] | null {
  if (role === 'AHEA_ADMIN') return ['SBEA', 'VERDANA']
  if (role === 'AHGH_ADMIN') return ['SBGH', 'VERDANA']
  if (role === 'VERDANA_ADMIN') return ['VERDANA']
  return null
}

const DEFAULT_LEAVE_MAX: Record<string, number> = { VACATION: 5, SICK: 5, SIL: 5 }
const num = (v: unknown) => Number(v) || 0
type Details = Record<string, unknown> & { specialRun?: string; taxableIncome?: number; exempt13th?: number; lines?: SpecialLine[] }

/** Equivalent daily rate — the same conversion regular payslips use. */
const dailyRateOf = (e: { rateType: string; dailyRate: unknown; monthlyRate: unknown }) =>
  e.rateType === 'DAILY' ? num(e.dailyRate) : num(e.monthlyRate) / 22

/**
 * Basic salary earned in the year, per employee, from the regular cutoff
 * payslips: basic + paid leave, less tardiness and undertime (pay not earned).
 * Overtime, holiday/rest-day premiums, night differential and allowances are
 * not basic salary and are left out, as PD 851 requires. FINAL and LOCKED
 * payslips count; DRAFT ones are reported separately so the preparer knows
 * what is still missing.
 */
async function basicEarnedByEmployee(year: number, employeeIds: string[]) {
  const slips = await prisma.employeePayslip.findMany({
    where: { employeeId: { in: employeeIds }, cutoffPeriod: { startsWith: `${year}-` } },
    select: { employeeId: true, cutoffPeriod: true, status: true, basicPay: true, leavePay: true, lateDeduction: true, undertimeDeduction: true, details: true },
  })
  const out = new Map<string, { basic: number; leave: number; lates: number; basis: number; cutoffs: number; draftCutoffs: number; paid13th: number; exemptUsed: number }>()
  const get = (id: string) => {
    let v = out.get(id)
    if (!v) { v = { basic: 0, leave: 0, lates: 0, basis: 0, cutoffs: 0, draftCutoffs: 0, paid13th: 0, exemptUsed: 0 }; out.set(id, v) }
    return v
  }
  for (const s of slips) {
    const v = get(s.employeeId)
    if (isRegularCutoff(s.cutoffPeriod)) {
      if (s.status === 'DRAFT') { v.draftCutoffs++; continue }
      const lates = num(s.lateDeduction) + num(s.undertimeDeduction)
      v.basic += num(s.basicPay); v.leave += num(s.leavePay); v.lates += lates
      v.basis += num(s.basicPay) + num(s.leavePay) - lates
      v.cutoffs++
    } else if (parseSpecialPeriod(s.cutoffPeriod)) {
      // 13th month already released this year (a December run, or the pro-rated part of a final pay).
      const d = (s.details ?? {}) as Details
      v.exemptUsed += num(d.exempt13th)
      for (const l of (Array.isArray(d.lines) ? d.lines : [])) if (l.kind === 'THIRTEENTH') v.paid13th += num(l.amount)
    }
  }
  return out
}

/** Taxable income + tax already on this employee's OTHER payslips in a month (regular cutoffs and other special runs). */
async function monthTaxableElsewhere(employeeId: string, year: number, month: number, excludePeriod: string) {
  const ym = `${year}-${String(month).padStart(2, '0')}-`
  const slips = await prisma.employeePayslip.findMany({
    where: { employeeId, cutoffPeriod: { startsWith: ym, not: excludePeriod } },
    select: { grossPay: true, sssDeduction: true, philhealthDeduction: true, pagibigDeduction: true, details: true },
  })
  let taxable = 0
  for (const s of slips) {
    const d = (s.details ?? {}) as Details
    taxable += typeof d.taxableIncome === 'number' ? d.taxableIncome
      : Math.max(0, num(s.grossPay) - num(s.sssDeduction) - num(s.philhealthDeduction) - num(s.pagibigDeduction))
  }
  return r2(taxable)
}

export async function GET(req: Request) {
  const session = await auth()
  const role = session?.user?.role as string
  if (!session?.user || !READ_ROLES.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const year = parseInt(sp.get('year') || String(new Date().getFullYear()), 10)
  const month = parseInt(sp.get('month') || String(new Date().getMonth() + 1), 10)
  const branch = sp.get('branch') || ''
  const compute = (sp.get('compute') || '') as SpecialRunType | ''
  const allowed = allowedBranches(role)
  if (branch && allowed && !allowed.includes(branch)) return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
  const branchWhere = branch ? { branch } : allowed ? { branch: { in: allowed } } : {}

  try {
    // ── Employee picker (final pay is normally for someone already inactive) ──
    if (sp.get('employees')) {
      const employees = await prisma.employee.findMany({
        where: branchWhere,
        select: { id: true, firstName: true, lastName: true, branch: true, isActive: true, jobTitle: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })
      return NextResponse.json({ employees })
    }

    // ── 13th-month worksheet ──
    if (compute === 'THIRTEENTH') {
      const employees = await prisma.employee.findMany({
        where: { isActive: true, ...branchWhere },
        select: { id: true, firstName: true, lastName: true, branch: true, isMWE: true, dateHired: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })
      const earned = await basicEarnedByEmployee(year, employees.map(e => e.id))
      const period = specialPeriod('THIRTEENTH', year, month)
      const existing = await prisma.employeePayslip.findMany({
        where: { cutoffPeriod: period, employeeId: { in: employees.map(e => e.id) } },
        select: { id: true, employeeId: true, status: true, grossPay: true, details: true },
      })
      const exBy = new Map(existing.map(x => [x.employeeId, x]))
      const rows = employees.map(e => {
        const v = earned.get(e.id) || { basic: 0, leave: 0, lates: 0, basis: 0, cutoffs: 0, draftCutoffs: 0, paid13th: 0, exemptUsed: 0 }
        const ex = exBy.get(e.id)
        // Whatever THIS period's run already holds is not "already paid elsewhere".
        const exD = (ex?.details ?? {}) as Details
        const thisRun13th = (Array.isArray(exD.lines) ? exD.lines : []).filter(l => l.kind === 'THIRTEENTH').reduce((s, l) => s + num(l.amount), 0)
        const paidElsewhere = r2(v.paid13th - thisRun13th)
        const accrued = r2(v.basis / 12)
        return {
          employeeId: e.id, name: `${e.lastName}, ${e.firstName}`, branch: e.branch, isMWE: e.isMWE, dateHired: e.dateHired,
          basicPay: r2(v.basic), leavePay: r2(v.leave), lates: r2(v.lates), basis: r2(v.basis),
          cutoffs: v.cutoffs, draftCutoffs: v.draftCutoffs,
          accrued, alreadyPaid: paidElsewhere, due: r2(Math.max(0, accrued - paidElsewhere)),
          exemptUsed: r2(v.exemptUsed - num(exD.exempt13th)),
          existing: ex ? { id: ex.id, status: ex.status, amount: num(ex.grossPay), extraBasic: num((exD as { extraBasic?: number }).extraBasic) } : null,
        }
      })
      return NextResponse.json({ period, year, month, exemptCeiling: THIRTEENTH_EXEMPT_CEILING, rows })
    }

    // ── Final-pay / maternity worksheet for one employee ──
    if (compute === 'FINAL' || compute === 'MATERNITY') {
      const employeeId = sp.get('employeeId') || ''
      const e = await prisma.employee.findUnique({ where: { id: employeeId } })
      if (!e) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
      if (allowed && !allowed.includes(e.branch)) return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
      const dailyRate = r2(dailyRateOf(e))
      const base = {
        employee: { id: e.id, name: `${e.firstName} ${e.lastName}`, branch: e.branch, isActive: e.isActive, isMWE: e.isMWE, dateHired: e.dateHired, rateType: e.rateType, dailyRate, monthlyRate: num(e.monthlyRate) },
        period: specialPeriod(compute, year, month, e.id),
      }
      const existing = await prisma.employeePayslip.findFirst({ where: { employeeId: e.id, cutoffPeriod: base.period }, select: { id: true, status: true, details: true, grossPay: true, netPay: true, taxDeduction: true } })

      if (compute === 'MATERNITY') {
        const leaves = await prisma.employeeRequest.findMany({
          where: { employeeId: e.id, requestType: 'LEAVE', leaveType: 'MATERNITY', status: 'APPROVED' },
          select: { startDate: true, endDate: true }, orderBy: { startDate: 'desc' }, take: 3,
        })
        // Full pay for the leave: monthly-paid staff are paid for calendar days (monthly ÷ 30),
        // daily-paid staff for the working days their rate implies (22 a month ÷ 30).
        const calendarDayRate = r2(e.rateType === 'MONTHLY' ? num(e.monthlyRate) / 30 : (num(e.dailyRate) * 22) / 30)
        return NextResponse.json({ ...base, calendarDayRate, maternityLeaves: leaves, existing })
      }

      const earned = (await basicEarnedByEmployee(year, [e.id])).get(e.id) || { basic: 0, leave: 0, lates: 0, basis: 0, cutoffs: 0, draftCutoffs: 0, paid13th: 0, exemptUsed: 0 }
      const exD = (existing?.details ?? {}) as Details
      const thisRun13th = (Array.isArray(exD.lines) ? exD.lines : []).filter(l => l.kind === 'THIRTEENTH').reduce((s, l) => s + num(l.amount), 0)
      const paidElsewhere = r2(earned.paid13th - thisRun13th)
      const accrued = r2(earned.basis / 12)

      // Unused leave, per type, for the year.
      const settings = await prisma.employeeSettings.findFirst()
      const leaveMax: Record<string, number> = { ...DEFAULT_LEAVE_MAX, ...((settings?.leaveMaxDays as Record<string, number>) || {}) }
      const yStart = new Date(Date.UTC(year, 0, 1)), yEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59))
      const reqs = await prisma.employeeRequest.findMany({
        where: { employeeId: e.id, requestType: 'LEAVE', status: 'APPROVED', leaveType: { not: null }, startDate: { lte: yEnd }, OR: [{ endDate: { gte: yStart } }, { endDate: null, startDate: { gte: yStart } }] },
        select: { leaveType: true, startDate: true, endDate: true, isHalfDay: true },
      })
      const used: Record<string, number> = {}
      for (const q of reqs) {
        if (!q.leaveType || !q.startDate) continue
        const s = new Date(Math.max(q.startDate.getTime(), yStart.getTime()))
        const en = new Date(Math.min((q.endDate ?? q.startDate).getTime(), yEnd.getTime()))
        const days = q.isHalfDay ? 0.5 : (s > en ? 0 : Math.floor((en.getTime() - s.getTime()) / 86400000) + 1)
        used[q.leaveType] = (used[q.leaveType] || 0) + days
      }
      const leave = ['SIL', 'VACATION', 'SICK'].map(t => ({ type: t, max: num(leaveMax[t]), used: used[t] || 0, remaining: Math.max(0, num(leaveMax[t]) - (used[t] || 0)) }))

      // Outstanding staff loans — final pay is the last chance to collect them.
      const loans = await prisma.staffLoan.findMany({
        where: { employeeId: e.id, status: 'ACTIVE' },
        select: { id: true, category: true, description: true, principal: true, deductions: { select: { amount: true } } },
      })
      const loanRows = loans.map(l => ({
        id: l.id, label: `${l.category === 'LOAN' ? 'Staff loan' : l.category.replace(/_/g, ' ').toLowerCase()}${l.description ? ' — ' + l.description : ''}`,
        balance: r2(num(l.principal) - l.deductions.reduce((s, d) => s + num(d.amount), 0)),
      })).filter(l => l.balance > 0.005)

      return NextResponse.json({
        ...base,
        thirteenth: { basis: r2(earned.basis), cutoffs: earned.cutoffs, draftCutoffs: earned.draftCutoffs, accrued, alreadyPaid: paidElsewhere, due: r2(Math.max(0, accrued - paidElsewhere)) },
        leave, leaveExemptDays: LEAVE_CONVERSION_EXEMPT_DAYS, loans: loanRows,
        exemptUsed: r2(earned.exemptUsed - num(exD.exempt13th)), exemptCeiling: THIRTEENTH_EXEMPT_CEILING,
        monthTaxable: await monthTaxableElsewhere(e.id, year, month, base.period),
        existing,
      })
    }

    // ── Saved runs for the year ──
    const slips = await prisma.employeePayslip.findMany({
      where: { cutoffPeriod: { startsWith: `${year}-` }, ...branchWhere },
      include: { employee: { select: { id: true, firstName: true, lastName: true, isActive: true } } },
      orderBy: [{ cutoffPeriod: 'desc' }],
    })
    const runs = slips.filter(s => parseSpecialPeriod(s.cutoffPeriod)).map(s => {
      const p = parseSpecialPeriod(s.cutoffPeriod)!
      const d = (s.details ?? {}) as Details
      return {
        id: s.id, type: p.type, cutoffPeriod: s.cutoffPeriod, year: p.year, month: p.month, branch: s.branch, status: s.status,
        employeeId: s.employeeId, name: `${s.employee.lastName}, ${s.employee.firstName}`,
        gross: num(s.grossPay), taxable: num(d.taxableIncome), exempt: r2(num(d.exempt13th) + num((d as { exemptOther?: number }).exemptOther)),
        tax: num(s.taxDeduction), deductions: num(s.otherDeductions), net: num(s.netPay),
        salariesRemitted: s.salariesRemitted, taxRemitted: s.taxRemitted, details: d,
      }
    })
    return NextResponse.json({ runs })
  } catch (err) {
    console.error('[special-runs] GET failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

interface RowIn {
  employeeId: string
  lines?: SpecialLine[]
  deductions?: SpecialDeduction[]
  taxOverride?: number | null
  notes?: string
  extraBasic?: number
  maternity?: { periodFrom?: string; periodTo?: string; days?: number; sssBenefit?: number; fullPay?: number }
}

export async function POST(req: Request) {
  const session = await auth()
  const role = session?.user?.role as string
  if (!session?.user || !WRITE_ROLES.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const b = await req.json()
    const type = b.type as SpecialRunType
    const year = parseInt(b.year, 10), month = parseInt(b.month, 10)
    const rowsIn: RowIn[] = Array.isArray(b.rows) ? b.rows : []
    if (!TYPES.includes(type) || !(year > 2000) || !(month >= 1 && month <= 12) || rowsIn.length === 0) {
      return NextResponse.json({ error: 'type, year, month and at least one row are required' }, { status: 400 })
    }
    const allowed = allowedBranches(role)
    const employees = await prisma.employee.findMany({ where: { id: { in: rowsIn.map(r => r.employeeId) } } })
    const empBy = new Map(employees.map(e => [e.id, e]))
    const earned = await basicEarnedByEmployee(year, employees.map(e => e.id))

    const saved: { employeeId: string; id: string; cutoffPeriod: string; branch: string }[] = []
    const skipped: { employeeId: string; name: string; reason: string }[] = []

    for (const row of rowsIn) {
      const e = empBy.get(row.employeeId)
      if (!e) { skipped.push({ employeeId: row.employeeId, name: row.employeeId, reason: 'Employee not found' }); continue }
      const name = `${e.firstName} ${e.lastName}`
      if (allowed && !allowed.includes(e.branch)) { skipped.push({ employeeId: e.id, name, reason: 'Not your branch' }); continue }
      const period = specialPeriod(type, year, month, e.id)
      const branch = e.branch

      const existing = await prisma.employeePayslip.findUnique({ where: { employeeId_cutoffPeriod_branch: { employeeId: e.id, cutoffPeriod: period, branch } } })
      if (existing && existing.status === 'LOCKED') { skipped.push({ employeeId: e.id, name, reason: 'Already locked — unlock it first to change it' }); continue }

      const lines: SpecialLine[] = (Array.isArray(row.lines) ? row.lines : [])
        .map(l => ({ kind: l.kind, label: String(l.label || '').slice(0, 120), amount: r2(l.amount), ...(l.days != null ? { days: Number(l.days) || 0 } : {}), ...(l.rate != null ? { rate: r2(l.rate) } : {}) }))
        .filter(l => l.amount > 0 && ['THIRTEENTH', 'LEAVE_CONVERSION', 'SALARY_DIFFERENTIAL', 'OTHER_TAXABLE', 'OTHER_NONTAXABLE'].includes(l.kind))
      const deductions: SpecialDeduction[] = (Array.isArray(row.deductions) ? row.deductions : [])
        .map(d => ({ label: String(d.label || 'Deduction').slice(0, 120), amount: r2(d.amount), staffLoanId: d.staffLoanId || null }))
        .filter(d => d.amount > 0)

      const mat = type === 'MATERNITY' ? {
        periodFrom: row.maternity?.periodFrom || null, periodTo: row.maternity?.periodTo || null,
        days: Number(row.maternity?.days) || 0, sssBenefit: r2(row.maternity?.sssBenefit || 0), fullPay: r2(row.maternity?.fullPay || 0),
      } : null
      // A maternity run may have no salary differential at all (SSS benefit ≥ full pay) —
      // it is still worth recording for the SSS advance. Anything else needs an earning.
      if (lines.length === 0 && !(mat && mat.sssBenefit > 0)) { skipped.push({ employeeId: e.id, name, reason: 'Nothing to pay' }); continue }

      // Exemption already used in OTHER runs this year (this run's own previous figure excluded).
      const prevD = (existing?.details ?? {}) as Details
      const exemptUsed = Math.max(0, (earned.get(e.id)?.exemptUsed || 0) - num(prevD.exempt13th))
      const c = classifyLines(lines, exemptUsed)
      const computedTax = marginalTax(await monthTaxableElsewhere(e.id, year, month, period), c.taxable, e.isMWE)
      const override = row.taxOverride
      const tax = override != null && override !== ('' as unknown) && !isNaN(Number(override)) ? r2(Math.max(0, Number(override))) : computedTax
      const dedTotal = r2(deductions.reduce((s, d) => s + d.amount, 0))
      const net = r2(c.gross - tax - dedTotal)
      if (net < -0.005) { skipped.push({ employeeId: e.id, name, reason: `Deductions and tax (₱${(tax + dedTotal).toFixed(2)}) exceed the pay (₱${c.gross.toFixed(2)})` }); continue }

      const details = {
        specialRun: type, label: SPECIAL_LABEL[type],
        // ALWAYS set — the 1601-C treats the whole gross as taxable without it.
        taxableIncome: c.taxable, exempt13th: c.exempt13th, exemptOther: c.exemptOther,
        lines, deductions, computedTax, taxOverridden: tax !== computedTax,
        payDate: b.payDate || null, notes: row.notes ? String(row.notes).slice(0, 500) : null,
        ...(type === 'THIRTEENTH' ? { extraBasic: r2(row.extraBasic || 0), basis: r2(earned.get(e.id)?.basis || 0) } : {}),
        ...(mat ? { maternity: mat } : {}),
        ...(prevD.availmentId ? { availmentId: prevD.availmentId } : {}),
      } as Record<string, unknown>

      const money = {
        basicPay: 0, leavePay: 0, overtimePay: 0, holidayPay: 0, nightDiffPay: 0, restDayPay: 0,
        allowances: c.gross, grossPay: c.gross,
        sssDeduction: 0, philhealthDeduction: 0, pagibigDeduction: 0,
        taxDeduction: tax, lateDeduction: 0, undertimeDeduction: 0,
        otherDeductions: dedTotal, totalDeductions: r2(tax + dedTotal),
        sssEmployerShare: 0, philhealthEmployerShare: 0, pagibigEmployerShare: 0,
        netPay: Math.max(0, net),
      }

      const slip = await prisma.$transaction(async (tx) => {
        // Maternity: the SSS benefit the company advances is a receivable from SSS, not
        // salary — it is tracked on the existing availment register (Benefits Payable ›
        // Availments), which is where its advance and reimbursement are followed up. Only
        // the salary differential (the company's own cost) is paid as payroll here.
        if (mat && mat.sssBenefit > 0) {
          const data = {
            branch, employeeId: e.id, employeeName: name, benefitType: 'MATERNITY',
            periodFrom: mat.periodFrom ? new Date(mat.periodFrom) : null, periodTo: mat.periodTo ? new Date(mat.periodTo) : null,
            amountAdvanced: mat.sssBenefit, companyShare: 0,
            notes: `From Payroll › Special Runs (${period}). Salary differential ₱${c.gross.toFixed(2)} is paid through payroll, not here.`,
          }
          const prevId = typeof details.availmentId === 'string' ? details.availmentId : ''
          const prev = prevId ? await tx.benefitAvailment.findUnique({ where: { id: prevId } }) : null
          if (prev) await tx.benefitAvailment.update({ where: { id: prev.id }, data })
          else details.availmentId = (await tx.benefitAvailment.create({ data: { ...data, createdById: session.user!.id as string } })).id
        }
        // Deductions are stored as cutoff adjustments so locking treats them like any
        // payroll deduction — a loan-linked one repays the loan and posts Dr salary / Cr 1160.
        await tx.cutoffAdjustment.deleteMany({ where: { employeeId: e.id, cutoffPeriod: period, branch } })
        if (deductions.length) {
          await tx.cutoffAdjustment.createMany({ data: deductions.map(d => ({
            employeeId: e.id, cutoffPeriod: period, branch, allowance: 0, allowanceType: 'NON_TAXABLE',
            deduction: d.amount, deductionType: 'NON_TAXABLE', deductionLabel: d.label, staffLoanId: d.staffLoanId || null,
          })) })
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json = details as any
        return tx.employeePayslip.upsert({
          where: { employeeId_cutoffPeriod_branch: { employeeId: e.id, cutoffPeriod: period, branch } },
          create: { employeeId: e.id, cutoffPeriod: period, branch, ...money, details: json, status: 'DRAFT', createdById: session.user!.id as string },
          update: { ...money, details: json, status: 'DRAFT' },
        })
      })
      saved.push({ employeeId: e.id, id: slip.id, cutoffPeriod: period, branch })
    }
    return NextResponse.json({ saved, skipped })
  } catch (err) {
    console.error('[special-runs] POST failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  const role = session?.user?.role as string
  if (!session?.user || !WRITE_ROLES.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id') || ''
  const slip = id ? await prisma.employeePayslip.findUnique({ where: { id } }) : null
  if (!slip || !parseSpecialPeriod(slip.cutoffPeriod)) return NextResponse.json({ error: 'Special run not found' }, { status: 404 })
  const allowed = allowedBranches(role)
  if (allowed && !allowed.includes(slip.branch)) return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
  if (slip.status === 'LOCKED') return NextResponse.json({ error: 'This run is locked and posted. Unlock it first.' }, { status: 409 })
  const d = (slip.details ?? {}) as Details
  await prisma.$transaction(async (tx) => {
    await tx.cutoffAdjustment.deleteMany({ where: { employeeId: slip.employeeId, cutoffPeriod: slip.cutoffPeriod, branch: slip.branch } })
    // Remove the maternity availment this run created, unless someone has already acted on it.
    if (typeof d.availmentId === 'string') {
      const a = await tx.benefitAvailment.findUnique({ where: { id: d.availmentId } })
      if (a && !a.advanceRfpId && !a.reimbursementRfpId && !(Number(a.reimbursedAmount) > 0)) await tx.benefitAvailment.delete({ where: { id: a.id } })
    }
    await tx.employeePayslip.delete({ where: { id: slip.id } })
  })
  return NextResponse.json({ success: true })
}
