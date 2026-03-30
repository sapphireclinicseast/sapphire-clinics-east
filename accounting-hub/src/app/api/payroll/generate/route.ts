import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

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
    if (branch) consultantWhere.branch = branch
    if (department) consultantWhere.department = department
    if (consultantId) consultantWhere.id = consultantId

    const consultants = await prisma.consultant.findMany({
      where: consultantWhere,
      include: {
        unitPayRates: {
          include: { unitPay: { select: { id: true, name: true } } },
        },
      },
      orderBy: { name: 'asc' },
    })

    // Get all orders in the cutoff period
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderWhere: any = {
      status: 'COMPLETED',
      transactionDate: { gte: start, lte: end },
    }
    if (branch) orderWhere.branch = branch

    const orders = await prisma.order.findMany({
      where: orderWhere,
      select: {
        id: true,
        clinicianName: true,
        branch: true,
        transactionDate: true,
        items: {
          select: {
            name: true,
            quantity: true,
            lineTotal: true,
            service: { select: { id: true, name: true, department: true, unitPayId: true } },
          },
        },
      },
    })

    // Get existing payroll entries for this cutoff
    const existingEntries = await prisma.payrollEntry.findMany({
      where: { cutoffPeriod, ...(branch ? { branch } : {}) },
      select: { consultantId: true, status: true },
    })
    const existingMap = new Map(existingEntries.map(e => [e.consultantId, e.status]))

    // Generate payroll preview for each consultant
    const payrollPreviews = consultants.map(c => {
      // Find orders for this consultant (match by name)
      const consultantOrders = orders.filter(o =>
        o.clinicianName && o.clinicianName.trim().toUpperCase() === c.name.trim().toUpperCase()
      )

      // Group by unit pay
      const unitPayBreakdown: { unitPayId: string; unitPayName: string; unitAmount: number; quantity: number; lineTotal: number }[] = []

      for (const order of consultantOrders) {
        for (const item of order.items) {
          if (!item.service?.unitPayId) continue
          const rate = c.unitPayRates.find(r => r.unitPayId === item.service!.unitPayId)
          if (!rate) continue

          const existing = unitPayBreakdown.find(b => b.unitPayId === item.service!.unitPayId)
          if (existing) {
            existing.quantity += item.quantity
            existing.lineTotal = existing.quantity * existing.unitAmount
          } else {
            unitPayBreakdown.push({
              unitPayId: item.service.unitPayId,
              unitPayName: rate.unitPay.name,
              unitAmount: Number(rate.amount),
              quantity: item.quantity,
              lineTotal: Number(rate.amount) * item.quantity,
            })
          }
        }
      }

      const unitPayTotal = unitPayBreakdown.reduce((s, b) => s + b.lineTotal, 0)
      const retainerAmount = Number(c.monthlyRetainer) / 2 // Half per cutoff
      const grossPay = unitPayTotal + retainerAmount
      const taxAmount = c.taxDeduction === 'FIVE_PERCENT' ? grossPay * 0.05 : 0
      const netPay = grossPay - taxAmount

      return {
        consultantId: c.id,
        consultantName: c.name,
        department: c.department,
        branch: c.branch,
        taxDeduction: c.taxDeduction,
        items: unitPayBreakdown,
        unitPayTotal,
        retainerAmount,
        grossPay,
        taxAmount,
        netPay,
        orderCount: consultantOrders.length,
        existingStatus: existingMap.get(c.id) || null,
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
          grossPay: entry.grossPay,
          retainerAmount: entry.retainerAmount,
          taxAmount: entry.taxAmount,
          netPay: entry.netPay,
          status: entry.status || 'DRAFT',
        },
        create: {
          consultantId: entry.consultantId,
          cutoffPeriod,
          branch: branch || entry.branch || '',
          items: entry.items,
          grossPay: entry.grossPay,
          retainerAmount: entry.retainerAmount,
          taxAmount: entry.taxAmount,
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
