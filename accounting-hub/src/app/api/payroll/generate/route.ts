import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** Safely convert a Prisma Decimal (or any value) to a plain JS number */
function toFloat(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  // Prisma Decimal objects have .toNumber() or toString()
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber()
  }
  return parseFloat(String(v)) || 0
}

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

function allowedBranches(role: string): string[] | null {
  if (role === 'AHEA_ADMIN') return ['SBEA', 'VERDANA']
  if (role === 'AHGH_ADMIN') return ['SBGH', 'VERDANA']
  if (role === 'VERDANA_ADMIN') return ['VERDANA']
  return null
}

// Consultants store branch as SBEA/SBGH, but orders store SANDBOX_EAST/SANDBOX_GREENHILLS
const BRANCH_TO_ORDER: Record<string, string> = {
  SBEA: 'SANDBOX_EAST',
  SBGH: 'SANDBOX_GREENHILLS',
  VERDANA: 'VERDANA_STORE',
  AHI: 'AURA_INSTITUTE',
}

// Parse cutoff period "2026-03-1" → { year: 2026, month: 3, half: 1 }
function parseCutoff(period: string) {
  const parts = period.split('-')
  return { year: parseInt(parts[0]), month: parseInt(parts[1]), half: parseInt(parts[2]) }
}

// Get date range for a cutoff period
function getCutoffDates(period: string) {
  const { year, month, half } = parseCutoff(period)
  if (half === 1) {
    return {
      start: new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+08:00`),
      end: new Date(`${year}-${String(month).padStart(2, '0')}-15T23:59:59.999+08:00`),
    }
  } else {
    const lastDay = new Date(year, month, 0).getDate()
    return {
      start: new Date(`${year}-${String(month).padStart(2, '0')}-16T00:00:00+08:00`),
      end: new Date(`${year}-${String(month).padStart(2, '0')}-${lastDay}T23:59:59.999+08:00`),
    }
  }
}

// GET: preview payroll for a cutoff (without saving)
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const cutoffPeriod = searchParams.get('cutoffPeriod') || ''
  const branch = searchParams.get('branch') || ''
  const consultantId = searchParams.get('consultantId') || ''
  const department = searchParams.get('department') || ''

  if (!cutoffPeriod) {
    return NextResponse.json({ error: 'cutoffPeriod is required (e.g., 2026-03-1)' }, { status: 400 })
  }

  try {
    // Allow client to pass custom date range (overrides default cutoff calculation)
    const dateFromParam = searchParams.get('dateFrom')
    const dateToParam = searchParams.get('dateTo')
    const { start, end } = dateFromParam && dateToParam
      ? { start: new Date(dateFromParam), end: new Date(dateToParam) }
      : getCutoffDates(cutoffPeriod)

    // Get consultants
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const consultantWhere: any = { isActive: true }
    const allowed = allowedBranches((session.user as { role?: string }).role || '')
    if (branch) {
      if (allowed && !allowed.includes(branch)) {
        return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
      }
      // Branch membership (primary / extraBranches / has-sessions-here) is applied in
      // JS below so interbranch consultants with sessions at this branch are included
      // even when it isn't their primary/extra branch.
    } else if (allowed) {
      consultantWhere.OR = [
        { branch: { in: allowed } },
        { extraBranches: { hasSome: allowed } },
      ]
    }
    if (department) consultantWhere.department = department
    if (consultantId) consultantWhere.id = consultantId

    const consultantsRaw = await prisma.consultant.findMany({
      where: consultantWhere,
      include: {
        unitPayRates: {
          include: { unitPay: { select: { id: true, name: true } } },
        },
        benefits: { where: { isActive: true } },
      },
      orderBy: { name: 'asc' },
    })

    // Benefit deduction cadence — reuse the same setting employees use so both
    // payrolls split monthly SSS/PHIC/HDMF across cutoffs identically.
    const benefitSettings = await prisma.employeeSettings.findFirst()
    const benefitTiming = (benefitSettings as unknown as Record<string, unknown>)?.benefitDeductionTiming as string || 'HALF_HALF'
    const cutoffHalf = cutoffPeriod.split('-')[2] // "1" or "2"
    const benefitMultiplier = benefitTiming === 'HALF_HALF' ? 0.5
      : benefitTiming === 'FIRST_CUTOFF' ? (cutoffHalf === '1' ? 1 : 0)
      : benefitTiming === 'SECOND_CUTOFF' ? (cutoffHalf === '2' ? 1 : 0)
      : 0.5
    // Compute this cutoff's per-consultant EE/ER benefit contributions.
    const consultantBenefit = (c: { benefits?: { benefitType: string; employeeShare: unknown; employerShare: unknown }[] }) => {
      const find = (t: string) => (c.benefits || []).find(b => b.benefitType === t)
      const sss = find('SSS'), phil = find('PHILHEALTH'), pag = find('PAGIBIG')
      return {
        sssDeduction: sss ? toFloat(sss.employeeShare) * benefitMultiplier : 0,
        philhealthDeduction: phil ? toFloat(phil.employeeShare) * benefitMultiplier : 0,
        pagibigDeduction: pag ? toFloat(pag.employeeShare) * benefitMultiplier : 0,
        sssEmployerShare: sss ? toFloat(sss.employerShare) * benefitMultiplier : 0,
        philhealthEmployerShare: phil ? toFloat(phil.employerShare) * benefitMultiplier : 0,
        pagibigEmployerShare: pag ? toFloat(pag.employerShare) * benefitMultiplier : 0,
      }
    }

    // Exclude anyone who is on the EMPLOYEE payroll — admin/clinician staff get
    // synced into both tables, but employees are paid via employee payroll, not
    // here. Match on externalStaffId (reliable) or "LASTNAME, FIRSTNAME"|branch.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const empWhere: any = { isActive: true }
    if (branch) empWhere.branch = branch
    else if (allowed) empWhere.branch = { in: allowed }
    const employees = await prisma.employee.findMany({
      where: empWhere,
      select: { externalStaffId: true, firstName: true, lastName: true, branch: true },
    })
    const empExtIds = new Set(employees.map(e => e.externalStaffId).filter(Boolean) as string[])
    const empNameKeys = new Set(employees.map(e => `${e.lastName}, ${e.firstName}`.trim().toUpperCase() + '|' + e.branch))
    const consultantsNoEmp = consultantsRaw.filter(c =>
      !(c.externalStaffId && empExtIds.has(c.externalStaffId)) &&
      !empNameKeys.has(`${c.name}`.trim().toUpperCase() + '|' + c.branch)
    )

    // Branch membership for a specific branch: primary branch, an extraBranch, OR having
    // sessions (completed orders) billed at this branch — so interbranch consultants get a
    // separate payslip per branch even when it isn't their primary/extra branch.
    let branchSessionNames = new Set<string>()
    if (branch) {
      const orderBranch = BRANCH_TO_ORDER[branch] || branch
      const oc = await prisma.order.findMany({
        where: { branch: orderBranch, status: 'COMPLETED', clinicianName: { not: null } },
        select: { clinicianName: true }, distinct: ['clinicianName'],
      })
      branchSessionNames = new Set(oc.map(o => (o.clinicianName || '').trim().toUpperCase()).filter(Boolean))
    }
    const consultants = branch
      ? consultantsNoEmp.filter(c => c.branch === branch || (c.extraBranches || []).includes(branch) || branchSessionNames.has(c.name.trim().toUpperCase()))
      : consultantsNoEmp

    // Get all orders in the cutoff period
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderWhere: any = {
      status: 'COMPLETED',
      transactionDate: { gte: start, lte: end },
    }
    if (branch) orderWhere.branch = { in: [BRANCH_TO_ORDER[branch] || branch, 'ALL'] }

    const orders = await prisma.order.findMany({
      where: orderWhere,
      select: {
        id: true,
        clinicianName: true,
        patientName: true,
        branch: true,
        transactionDate: true,
        netAmount: true,
        items: {
          select: {
            name: true,
            quantity: true,
            lineTotal: true,
            service: { select: { id: true, name: true, department: true, unitPayId: true, unitPayEnabled: true, thresholdCounted: true, thresholdQty: true } },
          },
        },
      },
    })

    // Get existing payroll entries for this cutoff (full data for LOCKED entries)
    const existingEntries = await prisma.payrollEntry.findMany({
      where: { cutoffPeriod, ...(branch ? { branch } : {}) },
    })
    const existingMap = new Map(existingEntries.map(e => [e.consultantId, e.status]))
    const existingDataMap = new Map(existingEntries.map(e => [e.consultantId, e]))

    // Load active incentive rules
    const incentiveRules = await prisma.incentiveRule.findMany({ where: { isActive: true } })

    // For LOCKED entries, look up current order statuses so we can annotate sessions
    // Collect all orderIds from locked entries' sessions
    const lockedOrderIds = new Set<string>()
    for (const entry of existingEntries) {
      if (entry.status === 'LOCKED') {
        const items = entry.items as { sessions?: { orderId?: string }[] }[]
        for (const item of items) {
          for (const s of item.sessions || []) {
            if (s.orderId) lockedOrderIds.add(s.orderId)
          }
        }
      }
    }
    // Fetch current status of all orders referenced in locked entries
    const lockedOrderStatuses = new Map<string, string>()
    if (lockedOrderIds.size > 0) {
      const orderStatuses = await prisma.order.findMany({
        where: { id: { in: Array.from(lockedOrderIds) } },
        select: { id: true, status: true },
      })
      for (const o of orderStatuses) lockedOrderStatuses.set(o.id, o.status)
    }

    // Generate payroll preview for each consultant
    const payrollPreviews = consultants.map(c => {
      // For LOCKED entries, return stored data with current order statuses
      const existingEntry = existingDataMap.get(c.id)
      if (existingEntry && existingEntry.status === 'LOCKED') {
        const rawStoredItems = (existingEntry.items as { unitPayId: string; unitPayName: string; unitAmount: number; quantity: number; lineTotal: number; isReduced?: boolean; sessions?: { orderId?: string; date: string; patientName: string; serviceName: string; orderNetAmount: number; orderStatus?: string }[] }[]).map(item => ({
          ...item,
          sessions: (item.sessions || []).map(s => ({
            ...s,
            orderStatus: s.orderId ? (lockedOrderStatuses.get(s.orderId) || s.orderStatus || 'COMPLETED') : (s.orderStatus || 'COMPLETED'),
          })),
        }))
        // Backward-compat: older saves merged extraItems INTO items, so stored
        // items can duplicate what's in extraItems. Dedupe here — drop any item
        // whose (unitPayId, unitAmount, quantity) matches an extraItem, and that
        // has no session detail (genuine order-derived items have sessions).
        const storedExtrasRaw = (existingEntry.extraItems as { unitPayId?: string; unitAmount?: number; qty?: number }[]) || []
        const storedItems = rawStoredItems.filter(item => {
          const hasSessions = (item.sessions || []).length > 0
          if (hasSessions) return true
          return !storedExtrasRaw.some(e =>
            e.unitPayId === item.unitPayId &&
            Math.abs(Number(e.unitAmount ?? 0) - Number(item.unitAmount)) < 0.01 &&
            Number(e.qty ?? 0) === Number(item.quantity)
          )
        })
        return {
          consultantId: c.id,
          consultantName: c.name,
          department: c.department,
          branch: c.branch,
          taxDeduction: c.taxDeduction,
          items: storedItems,
          unitPayTotal: storedItems.reduce((s, b) => s + b.lineTotal, 0),
          retainerAmount: Number(existingEntry.retainerAmount),
          incentives: (existingEntry.incentives as unknown[]) || [],
          incentiveTotal: Number(existingEntry.incentiveTotal ?? 0),
          grossPay: Number(existingEntry.grossPay),
          taxAmount: Number(existingEntry.taxAmount),
          sssDeduction: Number(existingEntry.sssDeduction),
          philhealthDeduction: Number(existingEntry.philhealthDeduction),
          pagibigDeduction: Number(existingEntry.pagibigDeduction),
          sssEmployerShare: Number(existingEntry.sssEmployerShare),
          philhealthEmployerShare: Number(existingEntry.philhealthEmployerShare),
          pagibigEmployerShare: Number(existingEntry.pagibigEmployerShare),
          netPay: Number(existingEntry.netPay),
          orderCount: storedItems.reduce((s, b) => s + (b.sessions?.length || 0), 0),
          existingStatus: 'LOCKED' as string,
          storedAdjustments: (existingEntry.adjustments as unknown[]) || [],
          storedExtraItems: (existingEntry.extraItems as unknown[]) || [],
        }
      }

      // Find orders for this consultant (match by name)
      const consultantOrders = orders.filter(o =>
        o.clinicianName && o.clinicianName.trim().toUpperCase() === c.name.trim().toUpperCase()
      )

      // Group by unit pay — with threshold logic per order
      const unitPayBreakdown: { unitPayId: string; unitPayName: string; unitAmount: number; quantity: number; lineTotal: number; isReduced?: boolean; sessions: { orderId: string; date: string; patientName: string; serviceName: string; quantity: number; orderNetAmount: number; orderStatus: string }[] }[] = []

      for (const order of consultantOrders) {
        const orderNet = Number(order.netAmount) || 0
        const orderDate = new Date(order.transactionDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

        // For threshold: subtract revenue of items that have their own (non-threshold) unit pay,
        // since those are already paid separately and shouldn't count toward the threshold basis
        let thresholdDeductions = 0
        for (const item of order.items) {
          if (!item.service?.unitPayId || item.service.unitPayEnabled === false) continue
          const r = c.unitPayRates.find(r => r.unitPayId === item.service!.unitPayId)
          if (r && !r.disabled && !r.thresholdEnabled) {
            thresholdDeductions += toFloat(item.lineTotal)
          }
        }
        const thresholdBasis = orderNet - thresholdDeductions

        // Full list of all service names on this order (shown in payslip session details)
        const allOrderServices = order.items.map(i => i.name).join(', ')

        for (const item of order.items) {
          if (!item.service?.unitPayId) continue
          if (item.service.unitPayEnabled === false) continue
          const rate = c.unitPayRates.find(r => r.unitPayId === item.service!.unitPayId)
          if (!rate || rate.disabled) continue

          // Determine effective rate: check threshold rule using adjusted basis
          // Use toFloat() to safely convert Prisma Decimal objects to plain JS numbers
          const fullAmount = toFloat(rate.amount)
          let effectiveAmount = fullAmount
          let isReduced = false

          const rateThresholdEnabled = rate.thresholdEnabled === true
          const rateThresholdAmount = rate.thresholdAmount != null ? toFloat(rate.thresholdAmount) : null
          const rateReducedAmount = rate.reducedAmount != null ? toFloat(rate.reducedAmount) : null

          // Debug log — remove once threshold bug is confirmed resolved
          if (c.name.toUpperCase().includes('DENISE') || c.name.toUpperCase().includes('SALAO')) {
            console.log(`[THRESHOLD-DEBUG] consultant=${c.name} unitPay=${rate.unitPay.name} | thresholdEnabled=${rate.thresholdEnabled} (${typeof rate.thresholdEnabled}) | thresholdAmount=${rate.thresholdAmount} (${typeof rate.thresholdAmount}) | reducedAmount=${rate.reducedAmount} (${typeof rate.reducedAmount}) | orderNet=${orderNet} | thresholdBasis=${thresholdBasis} | rateThresholdEnabled=${rateThresholdEnabled} | rateThresholdAmount=${rateThresholdAmount} | rateReducedAmount=${rateReducedAmount} | willReduce=${rateThresholdEnabled && rateThresholdAmount != null && rateReducedAmount != null && thresholdBasis < (rateThresholdAmount ?? Infinity)}`)
          }

          if (rateThresholdEnabled && rateThresholdAmount != null && rateReducedAmount != null) {
            if (thresholdBasis < rateThresholdAmount) {
              effectiveAmount = rateReducedAmount
              isReduced = true
            }
          }

          const sessionEntry = { orderId: order.id, date: orderDate, patientName: order.patientName || 'N/A', serviceName: allOrderServices, quantity: item.quantity, orderNetAmount: orderNet, orderStatus: 'COMPLETED' as string }

          // Aggregate by unitPayId + effectiveRate (so normal and reduced show separately)
          const existing = unitPayBreakdown.find(b =>
            b.unitPayId === item.service!.unitPayId && b.unitAmount === effectiveAmount
          )
          if (existing) {
            existing.quantity += item.quantity
            existing.lineTotal = existing.quantity * existing.unitAmount
            existing.sessions.push(sessionEntry)
          } else {
            unitPayBreakdown.push({
              unitPayId: item.service.unitPayId,
              unitPayName: rate.unitPay.name + (isReduced ? ' (Adjusted)' : ''),
              unitAmount: effectiveAmount,
              quantity: item.quantity,
              lineTotal: effectiveAmount * item.quantity,
              isReduced,
              sessions: [sessionEntry],
            })
          }
        }
      }

      const unitPayTotal = unitPayBreakdown.reduce((s, b) => s + b.lineTotal, 0)
      // Retainer + benefits are monthly per-person amounts, NOT per-branch. For an
      // interbranch consultant appearing on two branch payslips in the same cutoff,
      // apply them only on their PRIMARY branch so they aren't counted twice.
      const isPrimaryBranch = !branch || c.branch === branch
      const retainerAmount = isPrimaryBranch ? Number(c.monthlyRetainer) / 2 : 0

      // ── Incentive calculation ────────────────────────────────
      // Count sessions per calendar day (Asia/Manila). A single order with
      // quantity=2 counts as 2 sessions, not 1 — matches how therapists
      // actually deliver care. Only unit-pay-eligible items are counted so
      // that product add-ons don't inflate a therapist's session total.
      //
      // Only services flagged "Included in patient threshold count" (per-service
      // toggle on the Services page) are counted, each crediting its configured
      // thresholdQty (e.g. 2 for a 2-hour session). This weighted count drives
      // the daily minimum, the displayed count, AND the bonus, so the payslip's
      // Sessions × Rate always equals Total.
      const sessionsByDay = new Map<string, number>()
      for (const order of consultantOrders) {
        const dayKey = new Date(order.transactionDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) // YYYY-MM-DD
        let sessions = 0
        for (const item of order.items) {
          if (!item.service?.thresholdCounted) continue
          const qty = Number(item.quantity) || 1
          const weight = Number(item.service.thresholdQty) || 1
          sessions += qty * weight
        }
        if (sessions > 0) {
          sessionsByDay.set(dayKey, (sessionsByDay.get(dayKey) || 0) + sessions)
        }
      }

      const incentiveLines: {
        ruleId: string; ruleName: string; date: string
        patientCount: number; bonusPerUnit: number; bonus: number
      }[] = []

      for (const rule of incentiveRules) {
        // Department filter — empty array means all departments
        const depts = Array.isArray(rule.departments) ? rule.departments as string[] : []
        if (depts.length > 0 && !depts.includes(c.department)) continue
        // Branch filter — null means all branches.
        // Use the scheduling branch (request param) for interbranch consultants so
        // that a SBGH-specific rule applies when the consultant is scheduled at SBGH,
        // even if their primary branch is SBEA.
        const schedulingBranch = branch || c.branch
        if (rule.branch && rule.branch !== schedulingBranch) continue

        for (const [dayKey, count] of sessionsByDay) {
          if (count >= rule.threshold) {
            // `count` weights a BASIC SESSION (2 HOURS) as 2; it drives
            // qualification, the shown count, AND the bonus so the payslip's
            // Sessions × Rate equals Total.
            incentiveLines.push({
              ruleId: rule.id,
              ruleName: rule.name,
              date: dayKey,
              patientCount: count, // session count (a BASIC SESSION (2 HOURS) = 2)
              bonusPerUnit: Number(rule.bonusPerUnit),
              bonus: Number(rule.bonusPerUnit) * count,
            })
          }
        }
      }

      const incentiveTotal = incentiveLines.reduce((s, l) => s + l.bonus, 0)
      // ─────────────────────────────────────────────────────────

      const grossPay = unitPayTotal + retainerAmount + incentiveTotal
      const taxAmount = c.taxDeduction === 'FIVE_PERCENT' ? grossPay * 0.05 : 0
      const ben = isPrimaryBranch ? consultantBenefit(c) : { sssDeduction: 0, philhealthDeduction: 0, pagibigDeduction: 0, sssEmployerShare: 0, philhealthEmployerShare: 0, pagibigEmployerShare: 0 }
      const benefitEETotal = ben.sssDeduction + ben.philhealthDeduction + ben.pagibigDeduction
      const netPay = grossPay - taxAmount - benefitEETotal

      return {
        consultantId: c.id,
        consultantName: c.name,
        department: c.department,
        branch: c.branch,
        taxDeduction: c.taxDeduction,
        items: unitPayBreakdown,
        unitPayTotal,
        retainerAmount,
        incentives: incentiveLines,
        incentiveTotal,
        grossPay,
        taxAmount,
        ...ben,
        netPay,
        orderCount: consultantOrders.length,
        existingStatus: existingMap.get(c.id) || null,
        storedAdjustments: (existingEntry?.adjustments as unknown[]) || [],
        storedExtraItems: (existingEntry?.extraItems as unknown[]) || [],
      }
    })

    return NextResponse.json({
      cutoffPeriod,
      dateRange: { start: start.toISOString(), end: end.toISOString() },
      payrolls: payrollPreviews,
    })
  } catch (err) {
    console.error('Payroll generate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH: per-consultant lock / unlock
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { cutoffPeriod, branch, consultantId, action } = await req.json()
    if (!cutoffPeriod || !consultantId || !['lock', 'unlock'].includes(action)) {
      return NextResponse.json({ error: 'cutoffPeriod, consultantId, and action (lock|unlock) are required' }, { status: 400 })
    }

    const newStatus = action === 'lock' ? 'FINAL' : 'DRAFT'

    // Find the entry — branch may be empty string or null
    const entry = await prisma.payrollEntry.findFirst({
      where: { consultantId, cutoffPeriod, branch: branch || '' },
    })

    if (!entry) {
      return NextResponse.json({ error: 'No payroll entry found for this consultant / cutoff' }, { status: 404 })
    }

    // Prevent unlocking if a salary remittance has been recorded against this entry
    if (action === 'unlock' && entry.status === 'LOCKED') {
      // Check if this entry's payable status has been remitted
      const payable = await prisma.payrollPayableStatus.findFirst({
        where: { cutoffPeriod, branch: branch || '', payrollType: 'CONSULTANT' },
        select: { salariesRemitted: true },
      })
      if (payable?.salariesRemitted) {
        return NextResponse.json({ error: 'Cannot unlock — salary has already been remitted for this period.' }, { status: 400 })
      }
    }

    await prisma.payrollEntry.update({
      where: { id: entry.id },
      data: { status: newStatus },
    })

    return NextResponse.json({ success: true, newStatus })
  } catch (err) {
    console.error('Payroll per-person lock/unlock error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: save generated payroll entries
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { cutoffPeriod, branch, entries } = await req.json()

    if (!cutoffPeriod || !entries?.length) {
      return NextResponse.json({ error: 'cutoffPeriod and entries are required' }, { status: 400 })
    }

    const results = []
    for (const entry of entries) {
      // Never overwrite LOCKED entries
      const existing = await prisma.payrollEntry.findUnique({
        where: { consultantId_cutoffPeriod_branch: { consultantId: entry.consultantId, cutoffPeriod, branch: branch || entry.branch || '' } },
        select: { status: true },
      })
      if (existing?.status === 'LOCKED') continue

      const result = await prisma.payrollEntry.upsert({
        where: {
          consultantId_cutoffPeriod_branch: {
            consultantId: entry.consultantId,
            cutoffPeriod,
            branch: branch || entry.branch || '',
          },
        },
        update: {
          items: entry.items,
          extraItems: entry.extraItems || [],
          adjustments: entry.adjustments || [],
          incentives: entry.incentives || [],
          incentiveTotal: entry.incentiveTotal ?? 0,
          grossPay: entry.grossPay,
          retainerAmount: entry.retainerAmount,
          taxAmount: entry.taxAmount,
          sssDeduction: entry.sssDeduction ?? 0,
          philhealthDeduction: entry.philhealthDeduction ?? 0,
          pagibigDeduction: entry.pagibigDeduction ?? 0,
          sssEmployerShare: entry.sssEmployerShare ?? 0,
          philhealthEmployerShare: entry.philhealthEmployerShare ?? 0,
          pagibigEmployerShare: entry.pagibigEmployerShare ?? 0,
          netPay: entry.netPay,
          status: entry.status || 'DRAFT',
        },
        create: {
          consultantId: entry.consultantId,
          cutoffPeriod,
          branch: branch || entry.branch || '',
          items: entry.items,
          extraItems: entry.extraItems || [],
          adjustments: entry.adjustments || [],
          incentives: entry.incentives || [],
          incentiveTotal: entry.incentiveTotal ?? 0,
          grossPay: entry.grossPay,
          retainerAmount: entry.retainerAmount,
          taxAmount: entry.taxAmount,
          sssDeduction: entry.sssDeduction ?? 0,
          philhealthDeduction: entry.philhealthDeduction ?? 0,
          pagibigDeduction: entry.pagibigDeduction ?? 0,
          sssEmployerShare: entry.sssEmployerShare ?? 0,
          philhealthEmployerShare: entry.philhealthEmployerShare ?? 0,
          pagibigEmployerShare: entry.pagibigEmployerShare ?? 0,
          netPay: entry.netPay,
          status: entry.status || 'DRAFT',
          createdById: session.user.id,
        },
      })
      results.push(result)
    }

    return NextResponse.json({ saved: results.length }, { status: 201 })
  } catch (err) {
    console.error('Payroll save error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
