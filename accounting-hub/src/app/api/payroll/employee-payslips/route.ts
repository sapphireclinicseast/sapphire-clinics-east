import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']

/**
 * TRAIN Law withholding tax (Philippines, 2023 onwards)
 * Semi-monthly (per cutoff) tax table — annual brackets divided by 24
 */
function computeTrainTax(taxablePerCutoff: number): number {
  if (taxablePerCutoff <= 0) return 0
  // Semi-monthly brackets (annual / 24)
  if (taxablePerCutoff <= 10417) return 0
  if (taxablePerCutoff <= 16667) return (taxablePerCutoff - 10417) * 0.15
  if (taxablePerCutoff <= 33333) return 937.50 + (taxablePerCutoff - 16667) * 0.20
  if (taxablePerCutoff <= 83333) return 4270.83 + (taxablePerCutoff - 33333) * 0.25
  if (taxablePerCutoff <= 333333) return 16770.83 + (taxablePerCutoff - 83333) * 0.30
  return 91770.83 + (taxablePerCutoff - 333333) * 0.35
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
      employee: { select: { id: true, firstName: true, lastName: true, email: true, department: true, branch: true, rateType: true, dailyRate: true, monthlyRate: true } },
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
  const { cutoffPeriod, branch } = body
  // cutoffPeriod format: "2026-03-1" (year-month-cutoff#)

  if (!cutoffPeriod || !branch) {
    return NextResponse.json({ error: 'Missing cutoffPeriod or branch' }, { status: 400 })
  }

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

  // Get timekeeping records for this period — only FINALIZED uploads or manual entries
  const records = await prisma.timekeepingRecord.findMany({
    where: {
      date: { gte: startDate, lt: endDate },
      employee: { branch: qBranch, isActive: true },
      OR: [
        { uploadId: null }, // manual entries
        { upload: { status: 'FINALIZED' } },
      ],
    },
    orderBy: { date: 'asc' },
  })

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

    for (const rec of empRecords) {
      const hours = Number(rec.hoursWorked || 0)
      if (hours <= 0) continue

      daysWorked++
      totalHoursWorked += hours

      // Apply late grace period — only count late minutes beyond the grace
      const effectiveLate = Math.max(0, rec.lateMinutes - lateGrace)
      totalLateMinutes += effectiveLate
      totalUndertimeMinutes += rec.undertimeMinutes

      let dayPay = dailyRate

      // Holiday pay
      if (rec.isHoliday) {
        if (rec.holidayType === 'REGULAR') {
          dayPay = dailyRate * regHolidayRate
          holidayPay += dayPay - dailyRate
        } else if (rec.holidayType === 'SPECIAL_NON_WORKING') {
          dayPay = dailyRate * specHolidayRate
          holidayPay += dayPay - dailyRate
        }
      }

      // Rest day pay
      if (rec.isRestDay && !rec.isHoliday) {
        dayPay = dailyRate * restDayRate
        restDayPay += dayPay - dailyRate
      }

      basicPay += dailyRate

      // Overtime — round down to nearest interval, cap at max hours
      if (rec.overtimeMinutes > 0) {
        // Round down to nearest interval (e.g. 45min with 30min interval = 30min)
        const roundedOTMinutes = Math.floor(rec.overtimeMinutes / otInterval) * otInterval
        // Convert to hours and cap at max
        const otHours = Math.min(roundedOTMinutes / 60, otMaxHrs)
        if (otHours > 0) {
          totalOTHours += otHours
          overtimePay += hourlyRate * otMultiplier * otHours
        }
      }

      // Night differential (simplified — assume any hours after 10pm)
      // This is a simplification; actual implementation would check time ranges
      void nightDiffMult
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

    // Late & undertime deductions
    const lateDeduction = (totalLateMinutes / 60) * hourlyRate
    const undertimeDeduction = (totalUndertimeMinutes / 60) * hourlyRate

    // Cutoff adjustments (allowances & deductions) — aggregate multiple lines
    const empAdjs = adjByEmp.get(emp.id) || []
    let allowanceAmount = 0
    let adjDeductionAmount = 0
    let nonTaxableAllowance = 0
    const adjDetails: { allowanceLabel?: string | null; allowanceType?: string; deductionLabel?: string | null }[] = []
    for (const adj of empAdjs) {
      const allowAmt = Number(adj.allowance) || 0
      const dedAmt = Number(adj.deduction) || 0
      allowanceAmount += allowAmt
      adjDeductionAmount += dedAmt
      if (adj.allowanceType !== 'TAXABLE') nonTaxableAllowance += allowAmt
      adjDetails.push({ allowanceLabel: adj.allowanceLabel, allowanceType: adj.allowanceType, deductionLabel: adj.deductionLabel })
    }

    const grossPay = basicPay + overtimePay + holidayPay + restDayPay + nightDiffPay + allowanceAmount

    // TRAIN Law withholding tax (Philippines, 2023 onwards)
    // Taxable income per cutoff = gross - pre-tax deductions (SSS, PhilHealth, Pag-IBIG) - non-taxable allowances
    const preTaxDeductions = sssDeduction + philhealthDeduction + pagibigDeduction
    const taxablePerCutoff = grossPay - preTaxDeductions - nonTaxableAllowance
    const taxDeduction = computeTrainTax(taxablePerCutoff)

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
          details: adjDetails.length > 0 ? { adjustments: adjDetails } : undefined,
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
          details: adjDetails.length > 0 ? { adjustments: adjDetails } : undefined,
          status: 'DRAFT',
          createdById: session.user.id as string,
        },
      })
      payslips.push(payslip)
    } catch (e) {
      console.error(`Payslip generation error for ${emp.firstName} ${emp.lastName}:`, e)
    }
  }

  return NextResponse.json({ generated: payslips.length, payslips })
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
