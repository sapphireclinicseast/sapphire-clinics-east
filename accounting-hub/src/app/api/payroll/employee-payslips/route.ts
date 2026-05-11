import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']

// Day names by Date.getUTCDay()
const DAYS_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

/** Format a DateTime as HH:mm in Philippine Time (UTC+8) */
function fmtTimePH(dt: Date | null | undefined): string | null {
  if (!dt) return null
  const d = new Date(dt)
  const totalMin = (d.getUTCHours() * 60 + d.getUTCMinutes() + 8 * 60) % (24 * 60)
  const h = Math.floor(totalMin / 60), m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Get YYYY-MM-DD string from a midnight-UTC date record */
function fmtDateStr(dt: Date): string {
  return dt.toISOString().substring(0, 10)
}

/** Compute cutoff start/end Dates from settings */
function cutoffDateRange(
  settings: { cutoff1Start: number; cutoff1End: number; cutoff2Start: number; cutoff2End: number; cutoff2EndLastDay: boolean },
  year: number, month: number, cutoffNumStr: string
): { startDate: Date; endDate: Date } {
  let startDay: number, endDay: number
  if (cutoffNumStr === '1') {
    startDay = settings.cutoff1Start; endDay = settings.cutoff1End
  } else {
    startDay = settings.cutoff2Start
    endDay = settings.cutoff2EndLastDay ? new Date(year, month, 0).getDate() : settings.cutoff2End
  }
  let startDate: Date, endDate: Date
  if (startDay > endDay) {
    startDate = new Date(Date.UTC(year, month - 2, startDay))
    endDate = new Date(Date.UTC(year, month - 1, endDay))
  } else {
    startDate = new Date(Date.UTC(year, month - 1, startDay))
    endDate = new Date(Date.UTC(year, month - 1, endDay))
  }
  endDate = new Date(endDate); endDate.setDate(endDate.getDate() + 1)
  return { startDate, endDate }
}

/**
 * TRAIN Law withholding tax (Philippines, 2023 onwards) — monthly basis.
 * Tax is computed on full-month taxable income (annual brackets ÷ 12).
 * It is deducted only on the 2nd cutoff (or on cutoff 1 when computeTaxNow
 * is explicitly enabled, e.g. for resigning employees).
 */
function computeTrainTaxMonthly(taxableMonthly: number): number {
  if (taxableMonthly <= 0) return 0
  // Monthly brackets (annual / 12)
  if (taxableMonthly <= 20833) return 0
  if (taxableMonthly <= 33333) return (taxableMonthly - 20833) * 0.15
  if (taxableMonthly <= 66667) return 1875 + (taxableMonthly - 33333) * 0.20
  if (taxableMonthly <= 166667) return 8541.67 + (taxableMonthly - 66667) * 0.25
  if (taxableMonthly <= 666667) return 33541.67 + (taxableMonthly - 166667) * 0.30
  return 183541.67 + (taxableMonthly - 666667) * 0.35
}

function allowedBranches(role: string): string[] | null {
  if (role === 'SBEA_ADMIN') return ['SBEA', 'VERDANA']
  if (role === 'SBGH_ADMIN') return ['SBGH', 'VERDANA']
  if (role === 'VERDANA_ADMIN') return ['VERDANA']
  return null
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const cutoffPeriod = searchParams.get('cutoffPeriod') || ''
  const branch = searchParams.get('branch') || ''
  const status = searchParams.get('status') || ''
  const employeeId = searchParams.get('employeeId') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (cutoffPeriod) where.cutoffPeriod = cutoffPeriod
  if (status) where.status = status
  if (employeeId) where.employeeId = employeeId

  // Enforce branch restriction based on role
  const allowed = allowedBranches(session.user.role as string)
  if (branch) {
    if (allowed && !allowed.includes(branch)) {
      return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
    }
    where.branch = branch
  } else if (allowed) {
    where.branch = { in: allowed }
  }

  // Only include payslips for active employees
  where.employee = { isActive: true }

  const payslips = await prisma.employeePayslip.findMany({
    where,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, email: true, department: true, branch: true, rateType: true, dailyRate: true, monthlyRate: true, employeeBioId: true } },
    },
    orderBy: [{ employee: { lastName: 'asc' } }],
  })

  return NextResponse.json(payslips)
}

// Generate payslips for a cutoff period
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { cutoffPeriod, branch, computeTaxNowFor } = body
  // cutoffPeriod format: "2026-03-1" (year-month-cutoff#)
  // computeTaxNowFor: optional string[] of employeeIds to compute tax on cutoff 1 (resignations)

  if (!cutoffPeriod || !branch) {
    return NextResponse.json({ error: 'Missing cutoffPeriod or branch' }, { status: 400 })
  }

  const computeTaxNowSet = new Set<string>(computeTaxNowFor || [])
  const [yearStr, monthStr, cutoffNum] = cutoffPeriod.split('-')
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)

  // Get settings
  let settings = await prisma.employeeSettings.findFirst()
  if (!settings) {
    settings = await prisma.employeeSettings.create({ data: {} })
  }

  // Compute date range for cutoff
  let startDay: number, endDay: number
  if (cutoffNum === '1') {
    startDay = settings.cutoff1Start
    endDay = settings.cutoff1End
  } else {
    startDay = settings.cutoff2Start
    endDay = settings.cutoff2EndLastDay
      ? new Date(year, month, 0).getDate() // last day of month
      : settings.cutoff2End
  }

  // Handle cross-month cutoffs (e.g., 26th to 10th spans previous month to current)
  let startDate: Date, endDate: Date
  if (startDay > endDay) {
    // Cross-month: start is in previous month, end is in current month
    startDate = new Date(Date.UTC(year, month - 2, startDay)) // previous month
    endDate = new Date(Date.UTC(year, month - 1, endDay))     // current month
  } else {
    startDate = new Date(Date.UTC(year, month - 1, startDay))
    endDate = new Date(Date.UTC(year, month - 1, endDay))
  }
  endDate.setDate(endDate.getDate() + 1) // inclusive

  // Get active employees for this branch
  const qBranch = branch === 'SANDBOX_EAST' ? 'SBEA' : branch === 'SANDBOX_GREENHILLS' ? 'SBGH' : branch
  const employees = await prisma.employee.findMany({
    where: { isActive: true, branch: qBranch },
    include: { benefits: { where: { isActive: true } } },
  })

  // Get timekeeping records for this period — any upload status + manual entries
  // The upload review workflow (UPLOADED → ACCEPTED → FINALIZED) is an optional audit step
  // and must not gate payslip generation; records are valid once the upload is processed.
  const records = await prisma.timekeepingRecord.findMany({
    where: {
      date: { gte: startDate, lt: endDate },
      employee: { branch: qBranch, isActive: true },
    },
    orderBy: { date: 'asc' },
  })

  // Fetch approved OVERTIME requests for all employees in this branch for the cutoff period
  // OT is only paid if the employee has an approved OT request covering that date
  const approvedOTRequests = await prisma.employeeRequest.findMany({
    where: {
      requestType: 'OVERTIME',
      status: 'APPROVED',
      employee: { branch: qBranch, isActive: true },
      startDate: { lt: endDate },
      OR: [
        { endDate: { gte: startDate } },
        { endDate: null, startDate: { gte: startDate } },
      ],
    },
    select: { employeeId: true, startDate: true, endDate: true },
  })

  // Group approved OT requests by employeeId for fast lookup
  const otRequestsByEmp = new Map<string, { startDate: Date | null; endDate: Date | null }[]>()
  for (const req of approvedOTRequests) {
    if (!req.employeeId) continue
    if (!otRequestsByEmp.has(req.employeeId)) otRequestsByEmp.set(req.employeeId, [])
    otRequestsByEmp.get(req.employeeId)!.push({ startDate: req.startDate, endDate: req.endDate })
  }

  function hasApprovedOT(employeeId: string, date: Date): boolean {
    const reqs = otRequestsByEmp.get(employeeId) || []
    const d = date.getTime()
    return reqs.some(r => {
      const s = r.startDate ? r.startDate.getTime() : null
      const e = r.endDate ? r.endDate.getTime() : null
      if (s === null) return false
      if (e === null) return d >= s && d <= s + 86400000 - 1 // single-day: same day only
      return d >= s && d <= e
    })
  }

  // Get cutoff adjustments (allowances/deductions) for this period
  const adjustments = await prisma.cutoffAdjustment.findMany({
    where: { cutoffPeriod, branch: qBranch },
  })
  // Group adjustments by employee (multiple rows per employee now supported)
  const adjByEmp = new Map<string, typeof adjustments>()
  for (const a of adjustments) {
    if (!adjByEmp.has(a.employeeId)) adjByEmp.set(a.employeeId, [])
    adjByEmp.get(a.employeeId)!.push(a)
  }

  // Group records by employee
  const recByEmp = new Map<string, typeof records>()
  for (const r of records) {
    if (!recByEmp.has(r.employeeId)) recByEmp.set(r.employeeId, [])
    recByEmp.get(r.employeeId)!.push(r)
  }

  // Pre-fetch cutoff 1 payslips so cutoff 2 can compute the full-month tax correctly
  type C1Payslip = { grossPay: unknown; sssDeduction: unknown; philhealthDeduction: unknown; pagibigDeduction: unknown; taxDeduction: unknown; details: unknown }
  const c1PayslipsByEmpId = new Map<string, C1Payslip>()
  if (cutoffNum === '2') {
    const c1Period = `${yearStr}-${monthStr}-1`
    const c1Payslips = await prisma.employeePayslip.findMany({
      where: { cutoffPeriod: c1Period, branch: qBranch },
      select: { employeeId: true, grossPay: true, sssDeduction: true, philhealthDeduction: true, pagibigDeduction: true, taxDeduction: true, details: true },
    })
    for (const p of c1Payslips) c1PayslipsByEmpId.set(p.employeeId, p)
  }

  const standardHours = Number(settings.standardHoursPerDay)
  const otMultiplier = Number(settings.overtimeMultiplier)
  const nightDiffMult = Number(settings.nightDiffMultiplier)
  const regHolidayRate = Number(settings.regularHolidayRate)
  const specHolidayRate = Number(settings.specialHolidayRate)
  const restDayRate = Number(settings.restDayRate)
  const lateGrace = Number(settings.lateGraceMinutes) || 0
  const otInterval = Number(settings.otIntervalMinutes) || 30
  const otMaxHrs = Number(settings.otMaxHours) || 3

  const payslips = []
  const errors: string[] = []

  for (const emp of employees) {
    const empRecords = recByEmp.get(emp.id) || []
    const dailyRate = emp.rateType === 'DAILY' ? Number(emp.dailyRate) : Number(emp.monthlyRate) / 22 // 22 working days
    const hourlyRate = dailyRate / standardHours

    let basicPay = 0
    let overtimePay = 0
    let holidayPay = 0
    let restDayPay = 0
    let nightDiffPay = 0
    let daysWorked = 0
    let totalHoursWorked = 0
    let totalOTHours = 0
    let totalLateMinutes = 0
    let totalUndertimeMinutes = 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dailyBreakdown: Record<string, any[]> = {
      basicPay: [], overtimePay: [], holidayPay: [], nightDiffPay: [], restDayPay: [],
      lateDeduction: [], undertimeDeduction: [],
    }
    const empDaySchedules = emp.daySchedules as Record<string, { in: string; out: string }> | null

    // ── Fixed-salary bypass: not dependent on biometrics ──────────────────
    // When ignoreTimekeeping is true, pay exactly half the monthly equivalent
    // regardless of attendance records. No late/undertime deductions apply.
    if (emp.ignoreTimekeeping) {
      basicPay = emp.rateType === 'MONTHLY'
        ? Number(emp.monthlyRate) / 2
        : Number(emp.dailyRate) * 11   // 11 working days ≈ half of 22
      daysWorked = 11
      totalHoursWorked = daysWorked * standardHours
      dailyBreakdown.basicPay.push({ note: 'Fixed salary (not dependent on biometrics)', amount: basicPay })
    } else

    for (const rec of empRecords) {
      const hours = Number(rec.hoursWorked || 0)
      if (hours <= 0) continue

      daysWorked++
      totalHoursWorked += hours

      const recDate = fmtDateStr(rec.date)
      const recTimeIn = fmtTimePH(rec.timeIn)
      const recTimeOut = fmtTimePH(rec.timeOut)
      const dayName = DAYS_NAMES[rec.date.getUTCDay()]
      // Check holiday schedule key first (REGULAR_HOLIDAY / SPECIAL_HOLIDAY in daySchedules),
      // then per-day override, then employee default schedule
      const holidayKey = rec.isHoliday ? (rec.holidayType === 'REGULAR' ? 'REGULAR_HOLIDAY' : 'SPECIAL_HOLIDAY') : null
      const daySched = (holidayKey ? empDaySchedules?.[holidayKey] : null) ?? empDaySchedules?.[dayName] ?? null
      const scheduledIn = daySched?.in || emp.scheduleIn
      const scheduledOut = daySched?.out || emp.scheduleOut

      // Recompute late/undertime/overtime from actual clock times + current schedule.
      // Rule: employee must complete their full scheduled hours before overtime counts.
      // Required time-out = scheduledOut + rawLate, so if someone arrives 5 min late
      // their overtime baseline shifts by 5 min (11:05 in → OT starts after 8:05 PM).
      // Late grace period only suppresses the late *deduction* — the shift still applies.
      let computedLate = rec.lateMinutes
      let computedUndertime = rec.undertimeMinutes
      let recomputedOT = rec.overtimeMinutes // fallback when no raw times available
      if (rec.timeIn && rec.timeOut) {
        const phtIn = new Date(rec.timeIn.getTime() + 8 * 60 * 60 * 1000)
        const phtOut = new Date(rec.timeOut.getTime() + 8 * 60 * 60 * 1000)
        const [schInH, schInM] = scheduledIn.split(':').map(Number)
        const [schOutH, schOutM] = scheduledOut.split(':').map(Number)
        const actualInMin = phtIn.getUTCHours() * 60 + phtIn.getUTCMinutes()
        const actualOutMin = phtOut.getUTCHours() * 60 + phtOut.getUTCMinutes()
        const scheduledInMin = schInH * 60 + schInM
        const scheduledOutMin = schOutH * 60 + schOutM
        // Raw late arrival (before grace period)
        computedLate = Math.max(0, actualInMin - scheduledInMin)
        // Required time-out shifts by the full late arrival so employee completes full hours
        const requiredOutMin = scheduledOutMin + computedLate
        computedUndertime = Math.max(0, requiredOutMin - actualOutMin)
        recomputedOT = Math.max(0, actualOutMin - requiredOutMin)
      }

      // Apply late grace period — only count late minutes beyond the grace as a deduction
      const effectiveLate = Math.max(0, computedLate - lateGrace)
      totalLateMinutes += effectiveLate
      totalUndertimeMinutes += computedUndertime

      let dayPay = dailyRate

      // Holiday pay
      if (rec.isHoliday) {
        if (rec.holidayType === 'REGULAR') {
          dayPay = dailyRate * regHolidayRate
          holidayPay += dayPay - dailyRate
          dailyBreakdown.holidayPay.push({ date: recDate, timeIn: recTimeIn, timeOut: recTimeOut, holidayType: 'REGULAR', holidayRate: regHolidayRate, dailyRate, totalDayPay: dayPay, amount: dayPay - dailyRate })
        } else if (rec.holidayType === 'SPECIAL_NON_WORKING') {
          dayPay = dailyRate * specHolidayRate
          holidayPay += dayPay - dailyRate
          dailyBreakdown.holidayPay.push({ date: recDate, timeIn: recTimeIn, timeOut: recTimeOut, holidayType: 'SPECIAL_NON_WORKING', holidayRate: specHolidayRate, dailyRate, totalDayPay: dayPay, amount: dayPay - dailyRate })
        }
      }

      // Rest day pay
      if (rec.isRestDay && !rec.isHoliday) {
        dayPay = dailyRate * restDayRate
        restDayPay += dayPay - dailyRate
        dailyBreakdown.restDayPay.push({ date: recDate, timeIn: recTimeIn, timeOut: recTimeOut, restDayRate, dailyRate, totalDayPay: dayPay, amount: dayPay - dailyRate })
      }

      basicPay += dailyRate
      dailyBreakdown.basicPay.push({ date: recDate, timeIn: recTimeIn, timeOut: recTimeOut, hours, dailyRate, amount: dailyRate })

      // Overtime — only counted if employee has an approved OT request covering this date.
      // Uses recomputedOT (from shifted baseline) so OT only starts after full hours are done.
      if (recomputedOT > 0 && hasApprovedOT(emp.id, rec.date)) {
        // Round down to nearest interval (e.g. 45min with 30min interval = 30min)
        const roundedOTMinutes = Math.floor(recomputedOT / otInterval) * otInterval
        // Convert to hours and cap at max
        const otHours = Math.min(roundedOTMinutes / 60, otMaxHrs)
        if (otHours > 0) {
          totalOTHours += otHours
          const otAmt = hourlyRate * otMultiplier * otHours
          overtimePay += otAmt
          dailyBreakdown.overtimePay.push({ date: recDate, timeIn: recTimeIn, timeOut: recTimeOut, scheduledOut, rawMinutes: recomputedOT, roundedMinutes: roundedOTMinutes, otHours, multiplier: otMultiplier, hourlyRate, amount: otAmt })
        }
      }

      // Night differential (simplified — not yet tracked per-day)
      void nightDiffMult

      // Late / undertime breakdown
      if (effectiveLate > 0) {
        dailyBreakdown.lateDeduction.push({ date: recDate, timeIn: recTimeIn, timeOut: recTimeOut, scheduledIn, lateMinutes: computedLate, gracePeriod: lateGrace, effectiveLate, hourlyRate, amount: (effectiveLate / 60) * hourlyRate })
      }
      if (computedUndertime > 0) {
        dailyBreakdown.undertimeDeduction.push({ date: recDate, timeIn: recTimeIn, timeOut: recTimeOut, scheduledOut, undertimeMinutes: computedUndertime, hourlyRate, amount: (computedUndertime / 60) * hourlyRate })
      }
    }

    // Deductions — mandatory contributions
    const sssBenefit = emp.benefits.find(b => b.benefitType === 'SSS')
    const philBenefit = emp.benefits.find(b => b.benefitType === 'PHILHEALTH')
    const pagBenefit = emp.benefits.find(b => b.benefitType === 'PAGIBIG')

    // Benefit deduction timing: HALF_HALF (default), FIRST_CUTOFF, SECOND_CUTOFF
    const timing = (settings as unknown as Record<string, unknown>).benefitDeductionTiming as string || 'HALF_HALF'
    const cutoffNum = cutoffPeriod.split('-')[2] // "1" or "2"
    const benefitMultiplier = timing === 'HALF_HALF' ? 0.5
      : timing === 'FIRST_CUTOFF' ? (cutoffNum === '1' ? 1 : 0)
      : timing === 'SECOND_CUTOFF' ? (cutoffNum === '2' ? 1 : 0)
      : 0.5

    const sssDeduction = sssBenefit && settings.sssEnabled ? Number(sssBenefit.employeeShare) * benefitMultiplier : 0
    const philhealthDeduction = philBenefit && settings.philhealthEnabled ? Number(philBenefit.employeeShare) * benefitMultiplier : 0
    const pagibigDeduction = pagBenefit && settings.pagibigEnabled ? Number(pagBenefit.employeeShare) * benefitMultiplier : 0

    // Employer shares (for journal entries)
    const sssEmployerShare = sssBenefit && settings.sssEnabled ? Number(sssBenefit.employerShare) * benefitMultiplier : 0
    const philhealthEmployerShare = philBenefit && settings.philhealthEnabled ? Number(philBenefit.employerShare) * benefitMultiplier : 0
    const pagibigEmployerShare = pagBenefit && settings.pagibigEnabled ? Number(pagBenefit.employerShare) * benefitMultiplier : 0

    // Late is informational only — undertime already captures the full missed-time penalty
    // because required time-out shifts by the late arrival (no double-deduction).
    const lateDeduction = 0
    const undertimeDeduction = (totalUndertimeMinutes / 60) * hourlyRate

    // Cutoff adjustments (allowances & deductions) — aggregate multiple lines
    const empAdjs = adjByEmp.get(emp.id) || []
    let allowanceAmount = 0
    let adjDeductionAmount = 0
    let nonTaxableAllowance = 0
    const adjDetails: { allowanceLabel?: string | null; allowanceType?: string; allowanceAmount?: number; deductionLabel?: string | null; deductionAmount?: number }[] = []
    for (const adj of empAdjs) {
      const allowAmt = Number(adj.allowance) || 0
      const dedAmt = Number(adj.deduction) || 0
      allowanceAmount += allowAmt
      adjDeductionAmount += dedAmt
      if (adj.allowanceType !== 'TAXABLE') nonTaxableAllowance += allowAmt
      adjDetails.push({ allowanceLabel: adj.allowanceLabel, allowanceType: adj.allowanceType, allowanceAmount: allowAmt, deductionLabel: adj.deductionLabel, deductionAmount: dedAmt })
    }

    const grossPay = basicPay + overtimePay + holidayPay + restDayPay + nightDiffPay + allowanceAmount

    // TRAIN Law withholding tax (Philippines, 2023 onwards) — monthly basis.
    // Tax is computed on the combined month (cutoff 1 + cutoff 2 taxable incomes) and
    // deducted only on cutoff 2. On cutoff 1, tax is ₱0 unless computeTaxNow is set
    // (used for employees who resign before cutoff 2).
    const preTaxDeductions = sssDeduction + philhealthDeduction + pagibigDeduction
    const taxablePerCutoff = grossPay - preTaxDeductions - nonTaxableAllowance
    let taxDeduction = 0
    const empComputeNow = cutoffNum === '1' && computeTaxNowSet.has(emp.id)
    if (cutoffNum === '2') {
      const c1 = c1PayslipsByEmpId.get(emp.id)
      let c1TaxableIncome = 0
      if (c1) {
        const c1Det = c1.details as Record<string, unknown> | null
        c1TaxableIncome = typeof c1Det?.taxableIncome === 'number'
          ? c1Det.taxableIncome
          : Math.max(0, Number(c1.grossPay) - Number(c1.sssDeduction) - Number(c1.philhealthDeduction) - Number(c1.pagibigDeduction))
      }
      const monthlyTaxable = c1TaxableIncome + taxablePerCutoff
      const c1TaxPaid = c1 ? Number(c1.taxDeduction) : 0
      taxDeduction = Math.max(0, Math.round((computeTrainTaxMonthly(monthlyTaxable) - c1TaxPaid) * 100) / 100)
    } else if (empComputeNow) {
      taxDeduction = Math.round(computeTrainTaxMonthly(taxablePerCutoff) * 100) / 100
    }

    const totalDeductions = sssDeduction + philhealthDeduction + pagibigDeduction + taxDeduction + lateDeduction + undertimeDeduction + adjDeductionAmount
    const netPay = grossPay - totalDeductions

    try {
      const payslip = await prisma.employeePayslip.upsert({
        where: { employeeId_cutoffPeriod_branch: { employeeId: emp.id, cutoffPeriod, branch: qBranch } },
        update: {
          basicPay,
          overtimePay,
          holidayPay,
          nightDiffPay,
          restDayPay,
          allowances: allowanceAmount,
          grossPay,
          sssDeduction,
          philhealthDeduction,
          pagibigDeduction,
          sssEmployerShare,
          philhealthEmployerShare,
          pagibigEmployerShare,
          taxDeduction,
          lateDeduction,
          undertimeDeduction,
          otherDeductions: adjDeductionAmount,
          totalDeductions,
          netPay,
          daysWorked,
          hoursWorked: totalHoursWorked,
          overtimeHours: totalOTHours,
          lateMinutes: totalLateMinutes,
          undertimeMinutes: totalUndertimeMinutes,
          details: { adjustments: adjDetails, dailyBreakdown, taxableIncome: taxablePerCutoff },
          computeTaxNow: empComputeNow,
          status: 'DRAFT',
          createdById: session.user.id as string,
        },
        create: {
          employeeId: emp.id,
          cutoffPeriod,
          branch: qBranch,
          basicPay,
          overtimePay,
          holidayPay,
          nightDiffPay,
          restDayPay,
          allowances: allowanceAmount,
          grossPay,
          sssDeduction,
          philhealthDeduction,
          pagibigDeduction,
          sssEmployerShare,
          philhealthEmployerShare,
          pagibigEmployerShare,
          taxDeduction,
          lateDeduction,
          undertimeDeduction,
          otherDeductions: adjDeductionAmount,
          totalDeductions,
          netPay,
          daysWorked,
          hoursWorked: totalHoursWorked,
          overtimeHours: totalOTHours,
          lateMinutes: totalLateMinutes,
          undertimeMinutes: totalUndertimeMinutes,
          details: { adjustments: adjDetails, dailyBreakdown, taxableIncome: taxablePerCutoff },
          computeTaxNow: empComputeNow,
          status: 'DRAFT',
          createdById: session.user.id as string,
        },
      })
      payslips.push(payslip)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`Payslip generation error for ${emp.firstName} ${emp.lastName}:`, e)
      errors.push(`${emp.firstName} ${emp.lastName}: ${msg}`)
    }
  }

  return NextResponse.json({ generated: payslips.length, payslips, errors })
}

// Finalize payslips
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { ids, status } = body

  if (!ids || !Array.isArray(ids) || !status) {
    return NextResponse.json({ error: 'Missing ids or status' }, { status: 400 })
  }

  await prisma.employeePayslip.updateMany({
    where: { id: { in: ids } },
    data: { status },
  })

  return NextResponse.json({ updated: ids.length })
}

// Regenerate a single employee's payslip — re-reads schedules, timekeeping, and adjustments
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { employeeId, cutoffPeriod, branch, computeTaxNow } = body
    if (!employeeId || !cutoffPeriod || !branch) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const qBranch = branch === 'SANDBOX_EAST' ? 'SBEA' : branch === 'SANDBOX_GREENHILLS' ? 'SBGH' : branch

    // Don't allow regenerating LOCKED payslips
    const existing = await prisma.employeePayslip.findUnique({
      where: { employeeId_cutoffPeriod_branch: { employeeId, cutoffPeriod, branch: qBranch } },
      select: { status: true },
    })
    if (existing?.status === 'LOCKED') {
      return NextResponse.json({ error: 'Cannot regenerate a locked payslip. Unlock payroll first.' }, { status: 400 })
    }

    // Settings + date range
    let settings = await prisma.employeeSettings.findFirst()
    if (!settings) settings = await prisma.employeeSettings.create({ data: {} })

    const [yearStr, monthStr, cutoffNumStr] = cutoffPeriod.split('-')
    const year = parseInt(yearStr), month = parseInt(monthStr)
    const { startDate, endDate } = cutoffDateRange(settings, year, month, cutoffNumStr)

    // Fetch the employee with latest schedule
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { benefits: { where: { isActive: true } } },
    })
    if (!emp || !emp.isActive) {
      return NextResponse.json({ error: 'Employee not found or inactive' }, { status: 404 })
    }

    // Timekeeping records for this employee in the cutoff window — any upload status
    const empRecords = await prisma.timekeepingRecord.findMany({
      where: {
        employeeId,
        date: { gte: startDate, lt: endDate },
      },
      orderBy: { date: 'asc' },
    })

    // Approved OT requests
    const otRequests = await prisma.employeeRequest.findMany({
      where: {
        requestType: 'OVERTIME', status: 'APPROVED', employeeId,
        startDate: { lt: endDate },
        OR: [
          { endDate: { gte: startDate } },
          { endDate: null, startDate: { gte: startDate } },
        ],
      },
      select: { startDate: true, endDate: true },
    })
    function hasOT(date: Date): boolean {
      const d = date.getTime()
      return otRequests.some(r => {
        const s = r.startDate ? r.startDate.getTime() : null
        const e = r.endDate ? r.endDate.getTime() : null
        if (!s) return false
        if (!e) return d >= s && d <= s + 86400000 - 1
        return d >= s && d <= e
      })
    }

    // Cutoff adjustments
    const empAdjs = await prisma.cutoffAdjustment.findMany({
      where: { cutoffPeriod, employeeId, branch: qBranch },
    })

    // === Run computation (mirrors POST logic) ===
    const standardHours = Number(settings.standardHoursPerDay)
    const otMultiplier = Number(settings.overtimeMultiplier)
    const nightDiffMult = Number(settings.nightDiffMultiplier)
    const regHolidayRate = Number(settings.regularHolidayRate)
    const specHolidayRate = Number(settings.specialHolidayRate)
    const restDayRate = Number(settings.restDayRate)
    const lateGrace = Number(settings.lateGraceMinutes) || 0
    const otInterval = Number(settings.otIntervalMinutes) || 30
    const otMaxHrs = Number(settings.otMaxHours) || 3

    const dailyRate = emp.rateType === 'DAILY' ? Number(emp.dailyRate) : Number(emp.monthlyRate) / 22
    const hourlyRate = dailyRate / standardHours

    let basicPay = 0, overtimePay = 0, holidayPay = 0, restDayPay = 0
    let nightDiffPay = 0, daysWorked = 0, totalHoursWorked = 0
    let totalOTHours = 0, totalLateMinutes = 0, totalUndertimeMinutes = 0
    void nightDiffMult

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dailyBreakdown: Record<string, any[]> = {
      basicPay: [], overtimePay: [], holidayPay: [], nightDiffPay: [], restDayPay: [],
      lateDeduction: [], undertimeDeduction: [],
    }
    const empDaySchedules = emp.daySchedules as Record<string, { in: string; out: string }> | null

    // ── Fixed-salary bypass: not dependent on biometrics ──────────────────
    if (emp.ignoreTimekeeping) {
      basicPay = emp.rateType === 'MONTHLY'
        ? Number(emp.monthlyRate) / 2
        : Number(emp.dailyRate) * 11
      daysWorked = 11
      totalHoursWorked = daysWorked * standardHours
      dailyBreakdown.basicPay.push({ note: 'Fixed salary (not dependent on biometrics)', amount: basicPay })
    } else

    for (const rec of empRecords) {
      const hours = Number(rec.hoursWorked || 0)
      if (hours <= 0) continue

      daysWorked++; totalHoursWorked += hours

      const recDate = fmtDateStr(rec.date)
      const recTimeIn = fmtTimePH(rec.timeIn)
      const recTimeOut = fmtTimePH(rec.timeOut)
      const dayName = DAYS_NAMES[rec.date.getUTCDay()]
      const holidayKey = rec.isHoliday ? (rec.holidayType === 'REGULAR' ? 'REGULAR_HOLIDAY' : 'SPECIAL_HOLIDAY') : null
      const daySched = (holidayKey ? empDaySchedules?.[holidayKey] : null) ?? empDaySchedules?.[dayName] ?? null
      const scheduledIn = daySched?.in || emp.scheduleIn
      const scheduledOut = daySched?.out || emp.scheduleOut

      // Same rule as POST: employee must complete full scheduled hours before OT counts.
      // Required time-out = scheduledOut + rawLate (shifted by actual late arrival).
      let computedLate = rec.lateMinutes
      let computedUndertime = rec.undertimeMinutes
      let recomputedOT = rec.overtimeMinutes // fallback when no raw times available
      if (rec.timeIn && rec.timeOut) {
        const phtIn = new Date(rec.timeIn.getTime() + 8 * 60 * 60 * 1000)
        const phtOut = new Date(rec.timeOut.getTime() + 8 * 60 * 60 * 1000)
        const [schInH, schInM] = scheduledIn.split(':').map(Number)
        const [schOutH, schOutM] = scheduledOut.split(':').map(Number)
        const actualInMin = phtIn.getUTCHours() * 60 + phtIn.getUTCMinutes()
        const actualOutMin = phtOut.getUTCHours() * 60 + phtOut.getUTCMinutes()
        const scheduledInMin = schInH * 60 + schInM
        const scheduledOutMin = schOutH * 60 + schOutM
        computedLate = Math.max(0, actualInMin - scheduledInMin)
        const requiredOutMin = scheduledOutMin + computedLate
        computedUndertime = Math.max(0, requiredOutMin - actualOutMin)
        recomputedOT = Math.max(0, actualOutMin - requiredOutMin)
      }

      const effectiveLate = Math.max(0, computedLate - lateGrace)
      totalLateMinutes += effectiveLate
      totalUndertimeMinutes += computedUndertime

      let dayPay = dailyRate

      if (rec.isHoliday) {
        if (rec.holidayType === 'REGULAR') {
          dayPay = dailyRate * regHolidayRate; holidayPay += dayPay - dailyRate
          dailyBreakdown.holidayPay.push({ date: recDate, timeIn: recTimeIn, timeOut: recTimeOut, holidayType: 'REGULAR', holidayRate: regHolidayRate, dailyRate, totalDayPay: dayPay, amount: dayPay - dailyRate })
        } else if (rec.holidayType === 'SPECIAL_NON_WORKING') {
          dayPay = dailyRate * specHolidayRate; holidayPay += dayPay - dailyRate
          dailyBreakdown.holidayPay.push({ date: recDate, timeIn: recTimeIn, timeOut: recTimeOut, holidayType: 'SPECIAL_NON_WORKING', holidayRate: specHolidayRate, dailyRate, totalDayPay: dayPay, amount: dayPay - dailyRate })
        }
      }
      if (rec.isRestDay && !rec.isHoliday) {
        dayPay = dailyRate * restDayRate; restDayPay += dayPay - dailyRate
        dailyBreakdown.restDayPay.push({ date: recDate, timeIn: recTimeIn, timeOut: recTimeOut, restDayRate, dailyRate, totalDayPay: dayPay, amount: dayPay - dailyRate })
      }

      basicPay += dailyRate
      dailyBreakdown.basicPay.push({ date: recDate, timeIn: recTimeIn, timeOut: recTimeOut, hours, dailyRate, amount: dailyRate })

      if (recomputedOT > 0 && hasOT(rec.date)) {
        const roundedOTMinutes = Math.floor(recomputedOT / otInterval) * otInterval
        const otHours = Math.min(roundedOTMinutes / 60, otMaxHrs)
        if (otHours > 0) {
          totalOTHours += otHours
          const otAmt = hourlyRate * otMultiplier * otHours
          overtimePay += otAmt
          dailyBreakdown.overtimePay.push({ date: recDate, timeIn: recTimeIn, timeOut: recTimeOut, scheduledOut, rawMinutes: recomputedOT, roundedMinutes: roundedOTMinutes, otHours, multiplier: otMultiplier, hourlyRate, amount: otAmt })
        }
      }
      if (effectiveLate > 0) dailyBreakdown.lateDeduction.push({ date: recDate, timeIn: recTimeIn, timeOut: recTimeOut, scheduledIn, lateMinutes: computedLate, gracePeriod: lateGrace, effectiveLate, hourlyRate, amount: (effectiveLate / 60) * hourlyRate })
      if (computedUndertime > 0) dailyBreakdown.undertimeDeduction.push({ date: recDate, timeIn: recTimeIn, timeOut: recTimeOut, scheduledOut, undertimeMinutes: computedUndertime, hourlyRate, amount: (computedUndertime / 60) * hourlyRate })
    }

    const sssBenefit = emp.benefits.find(b => b.benefitType === 'SSS')
    const philBenefit = emp.benefits.find(b => b.benefitType === 'PHILHEALTH')
    const pagBenefit = emp.benefits.find(b => b.benefitType === 'PAGIBIG')

    const timing = (settings as unknown as Record<string, unknown>).benefitDeductionTiming as string || 'HALF_HALF'
    const cutoffNumFinal = cutoffPeriod.split('-')[2]
    const benefitMultiplier = timing === 'HALF_HALF' ? 0.5
      : timing === 'FIRST_CUTOFF' ? (cutoffNumFinal === '1' ? 1 : 0)
      : timing === 'SECOND_CUTOFF' ? (cutoffNumFinal === '2' ? 1 : 0) : 0.5

    const sssDeduction = sssBenefit && settings.sssEnabled ? Number(sssBenefit.employeeShare) * benefitMultiplier : 0
    const philhealthDeduction = philBenefit && settings.philhealthEnabled ? Number(philBenefit.employeeShare) * benefitMultiplier : 0
    const pagibigDeduction = pagBenefit && settings.pagibigEnabled ? Number(pagBenefit.employeeShare) * benefitMultiplier : 0
    const sssEmployerShare = sssBenefit && settings.sssEnabled ? Number(sssBenefit.employerShare) * benefitMultiplier : 0
    const philhealthEmployerShare = philBenefit && settings.philhealthEnabled ? Number(philBenefit.employerShare) * benefitMultiplier : 0
    const pagibigEmployerShare = pagBenefit && settings.pagibigEnabled ? Number(pagBenefit.employerShare) * benefitMultiplier : 0

    // Late is informational only — undertime already captures the full missed-time penalty
    const lateDeduction = 0
    const undertimeDeduction = (totalUndertimeMinutes / 60) * hourlyRate

    let allowanceAmount = 0, adjDeductionAmount = 0, nonTaxableAllowance = 0
    const adjDetails: { allowanceLabel?: string | null; allowanceType?: string; allowanceAmount?: number; deductionLabel?: string | null; deductionAmount?: number }[] = []
    for (const adj of empAdjs) {
      const allowAmt = Number(adj.allowance) || 0
      const dedAmt = Number(adj.deduction) || 0
      allowanceAmount += allowAmt; adjDeductionAmount += dedAmt
      if (adj.allowanceType !== 'TAXABLE') nonTaxableAllowance += allowAmt
      adjDetails.push({ allowanceLabel: adj.allowanceLabel, allowanceType: adj.allowanceType, allowanceAmount: allowAmt, deductionLabel: adj.deductionLabel, deductionAmount: dedAmt })
    }

    const grossPay = basicPay + overtimePay + holidayPay + restDayPay + nightDiffPay + allowanceAmount
    const preTaxDeductions = sssDeduction + philhealthDeduction + pagibigDeduction
    const taxablePerCutoff = grossPay - preTaxDeductions - nonTaxableAllowance

    // TRAIN Law withholding tax — monthly basis (same logic as POST)
    let taxDeduction = 0
    const isC1 = cutoffNumStr === '1'
    const shouldComputeNow = isC1 && !!computeTaxNow
    if (cutoffNumStr === '2') {
      const c1Period = `${yearStr}-${monthStr}-1`
      const c1Payslip = await prisma.employeePayslip.findUnique({
        where: { employeeId_cutoffPeriod_branch: { employeeId, cutoffPeriod: c1Period, branch: qBranch } },
        select: { grossPay: true, sssDeduction: true, philhealthDeduction: true, pagibigDeduction: true, taxDeduction: true, details: true },
      })
      let c1TaxableIncome = 0
      if (c1Payslip) {
        const c1Det = c1Payslip.details as Record<string, unknown> | null
        c1TaxableIncome = typeof c1Det?.taxableIncome === 'number'
          ? c1Det.taxableIncome
          : Math.max(0, Number(c1Payslip.grossPay) - Number(c1Payslip.sssDeduction) - Number(c1Payslip.philhealthDeduction) - Number(c1Payslip.pagibigDeduction))
      }
      const monthlyTaxable = c1TaxableIncome + taxablePerCutoff
      const c1TaxPaid = c1Payslip ? Number(c1Payslip.taxDeduction) : 0
      taxDeduction = Math.max(0, Math.round((computeTrainTaxMonthly(monthlyTaxable) - c1TaxPaid) * 100) / 100)
    } else if (shouldComputeNow) {
      taxDeduction = Math.round(computeTrainTaxMonthly(taxablePerCutoff) * 100) / 100
    }

    const totalDeductions = sssDeduction + philhealthDeduction + pagibigDeduction + taxDeduction + lateDeduction + undertimeDeduction + adjDeductionAmount
    const netPay = grossPay - totalDeductions

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upsertFields: any = {
      basicPay, overtimePay, holidayPay, nightDiffPay, restDayPay,
      allowances: allowanceAmount, grossPay,
      sssDeduction, philhealthDeduction, pagibigDeduction,
      sssEmployerShare, philhealthEmployerShare, pagibigEmployerShare,
      taxDeduction, lateDeduction, undertimeDeduction, otherDeductions: adjDeductionAmount,
      totalDeductions, netPay, daysWorked, hoursWorked: totalHoursWorked,
      overtimeHours: totalOTHours, lateMinutes: totalLateMinutes, undertimeMinutes: totalUndertimeMinutes,
      details: { adjustments: adjDetails, dailyBreakdown, taxableIncome: taxablePerCutoff },
      computeTaxNow: shouldComputeNow,
      status: 'DRAFT',
      createdById: session.user.id as string,
    }

    const payslip = await prisma.employeePayslip.upsert({
      where: { employeeId_cutoffPeriod_branch: { employeeId, cutoffPeriod, branch: qBranch } },
      update: upsertFields,
      create: { employeeId, cutoffPeriod, branch: qBranch, ...upsertFields },
      include: { employee: { select: { id: true, firstName: true, lastName: true, email: true, department: true, branch: true, rateType: true, dailyRate: true, monthlyRate: true, employeeBioId: true } } },
    })

    return NextResponse.json(payslip)
  } catch (err) {
    console.error('Regenerate payslip error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
