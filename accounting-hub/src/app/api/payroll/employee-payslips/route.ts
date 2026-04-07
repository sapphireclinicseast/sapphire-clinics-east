import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']

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

  const startDate = new Date(Date.UTC(year, month - 1, startDay))
  const endDate = new Date(Date.UTC(year, month - 1, endDay))
  endDate.setDate(endDate.getDate() + 1) // inclusive

  // Get active employees for this branch
  const qBranch = branch === 'SANDBOX_EAST' ? 'SBEA' : branch === 'SANDBOX_GREENHILLS' ? 'SBGH' : branch
  const employees = await prisma.employee.findMany({
    where: { isActive: true, branch: qBranch },
    include: { benefits: { where: { isActive: true } } },
  })

  // Get timekeeping records for this period
  const records = await prisma.timekeepingRecord.findMany({
    where: {
      date: { gte: startDate, lt: endDate },
      employee: { branch: qBranch, isActive: true },
    },
    orderBy: { date: 'asc' },
  })

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
      totalLateMinutes += rec.lateMinutes
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

      // Overtime
      if (rec.overtimeMinutes > 0) {
        const otHours = rec.overtimeMinutes / 60
        totalOTHours += otHours
        overtimePay += hourlyRate * otMultiplier * otHours
      }

      // Night differential (simplified — assume any hours after 10pm)
      // This is a simplification; actual implementation would check time ranges
      void nightDiffMult
    }

    // Deductions
    const sssBenefit = emp.benefits.find(b => b.benefitType === 'SSS')
    const philBenefit = emp.benefits.find(b => b.benefitType === 'PHILHEALTH')
    const pagBenefit = emp.benefits.find(b => b.benefitType === 'PAGIBIG')

    const sssDeduction = sssBenefit && settings.sssEnabled ? Number(sssBenefit.employeeShare) / 2 : 0 // Per cutoff (half monthly)
    const philhealthDeduction = philBenefit && settings.philhealthEnabled ? Number(philBenefit.employeeShare) / 2 : 0
    const pagibigDeduction = pagBenefit && settings.pagibigEnabled ? Number(pagBenefit.employeeShare) / 2 : 0

    // Late & undertime deductions
    const lateDeduction = (totalLateMinutes / 60) * hourlyRate
    const undertimeDeduction = (totalUndertimeMinutes / 60) * hourlyRate

    const grossPay = basicPay + overtimePay + holidayPay + restDayPay + nightDiffPay
    const totalDeductions = sssDeduction + philhealthDeduction + pagibigDeduction + lateDeduction + undertimeDeduction
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
          grossPay,
          sssDeduction,
          philhealthDeduction,
          pagibigDeduction,
          lateDeduction,
          undertimeDeduction,
          totalDeductions,
          netPay,
          daysWorked,
          hoursWorked: totalHoursWorked,
          overtimeHours: totalOTHours,
          lateMinutes: totalLateMinutes,
          undertimeMinutes: totalUndertimeMinutes,
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
          grossPay,
          sssDeduction,
          philhealthDeduction,
          pagibigDeduction,
          lateDeduction,
          undertimeDeduction,
          totalDeductions,
          netPay,
          daysWorked,
          hoursWorked: totalHoursWorked,
          overtimeHours: totalOTHours,
          lateMinutes: totalLateMinutes,
          undertimeMinutes: totalUndertimeMinutes,
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
