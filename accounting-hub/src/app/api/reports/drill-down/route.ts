import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

const CASH_METHODS = ['CASH', 'GCASH', 'PAYMAYA', 'DEBIT', 'CREDIT_CARD', 'SHOPEE', 'LAZADA', 'TIKTOK']

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash', GCASH: 'GCash', PAYMAYA: 'PayMaya', DEBIT: 'Debit Card',
  CREDIT_CARD: 'Credit Card', VIP_CARD: 'VIP Card', PREPAID_CARD: 'Prepaid Card',
  REWARD_POINTS: 'Reward Points', SHOPEE: 'Shopee', LAZADA: 'Lazada',
  TIKTOK: 'TikTok', DOWNPAYMENT: 'Downpayment', PACKAGE: 'Package', HMO: 'HMO',
  GL: 'Guarantee Letter',
}

const DEPT_LABELS: Record<string, string> = {
  PT: 'Physical Therapy', OT: 'Occupational Therapy', ST: 'Speech Therapy',
  SLP: 'Speech-Language Pathology', SPED: 'Special Education',
  PSY: 'Psychology', PSYCHOLOGY: 'Psychology', MD: 'Medical Doctor',
  CLI: 'Clinic', DIG: 'Digital & Tech', EDU: 'Training & Education',
  MER: 'Merchandise', ORTHOSIS_PROSTHESIS: 'Orthosis & Prosthesis', OTHER: 'Other',
}

const BRANCH_LABELS: Record<string, string> = {
  SBEA: 'Sandbox East', SBGH: 'Sandbox Greenhills', VERDANA_STORE: 'Verdana Store',
  SANDBOX_EAST: 'Sandbox East', SANDBOX_GREENHILLS: 'Sandbox Greenhills',
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
  const branch = searchParams.get('branch') || 'ALL'
  const month = parseInt(searchParams.get('month') || '0')
  const category = searchParams.get('category') || ''
  const accountKey = searchParams.get('accountKey') || '' // e.g. "7020 Occupational Therapy Services Revenue"

  const startDate = month > 0
    ? new Date(Date.UTC(year, month - 1, 1))
    : new Date(Date.UTC(year, 0, 1))
  const endDate = month > 0
    ? new Date(Date.UTC(year, month, 1))
    : new Date(Date.UTC(year + 1, 0, 1))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const branchFilter: any = branch !== 'ALL' ? { branch } : {}

  try {
    // Fetch deduction rates
    const paymentModes = await prisma.paymentMode.findMany({
      where: { isActive: true },
      select: { id: true, deductions: { select: { rate: true } } },
    })
    const modeDeductionRate: Record<string, number> = {}
    for (const pm of paymentModes) {
      modeDeductionRate[pm.id] = pm.deductions.reduce((s, d) => s + Number(d.rate), 0)
    }

    const isPaymentCategory = CASH_METHODS.includes(category) || category === 'CASH_BALANCE'

    // Deduction drill-down (MDR, CWT per transaction)
    if (category === 'DEDUCTION' && accountKey) {
      // Load deduction type breakdown for each payment mode
      const allModes = await prisma.paymentMode.findMany({
        where: { isActive: true },
        select: { id: true, name: true, deductions: { select: { name: true, rate: true, account: { select: { accountNumber: true, accountTitle: true } } } } },
      })
      // Map: paymentModeId → { name, rate } for the matching deduction type
      // Match by deduction name OR by COA account key (e.g. "1140 Creditable Withholding Tax")
      const modeMatch: Record<string, { modeName: string; rate: number; dedName: string }> = {}
      for (const pm of allModes) {
        for (const d of pm.deductions) {
          const coaKey = d.account ? `${d.account.accountNumber} ${d.account.accountTitle}` : ''
          if (d.name === accountKey || coaKey === accountKey || d.account?.accountTitle === accountKey) {
            modeMatch[pm.id] = { modeName: pm.name, rate: Number(d.rate), dedName: d.name }
          }
        }
      }
      const matchingModeIds = Object.keys(modeMatch)
      if (matchingModeIds.length === 0) {
        return NextResponse.json({ items: [], total: 0 })
      }

      const payments = await prisma.orderPayment.findMany({
        where: {
          paymentModeId: { in: matchingModeIds },
          order: {
            status: 'COMPLETED',
            transactionDate: { gte: startDate, lt: endDate },
            ...branchFilter,
          },
        },
        select: {
          amount: true,
          paymentModeId: true,
          method: true,
          order: {
            select: {
              transactionDate: true,
              patientName: true,
              branch: true,
              items: {
                take: 1,
                select: {
                  service: { select: { department: true } },
                  inventoryItem: { select: { skuDepartment: true } },
                },
              },
            },
          },
        },
        orderBy: { order: { transactionDate: 'asc' } },
      })

      const items = payments.map((p) => {
        const gross = Number(p.amount)
        const info = modeMatch[p.paymentModeId!]
        const dedAmt = gross * (info.rate / 100)
        const dept = p.order.items[0]?.service?.department || p.order.items[0]?.inventoryItem?.skuDepartment || 'OTHER'
        return {
          date: p.order.transactionDate.toISOString().split('T')[0],
          type: `${info.modeName} — ${PAYMENT_LABELS[p.method] || p.method} (${DEPT_LABELS[dept] || dept})${p.order.patientName ? ` · ${p.order.patientName}` : ''}`,
          branch: BRANCH_LABELS[p.order.branch] || p.order.branch,
          amount: dedAmt,
        }
      }).filter(i => i.amount > 0)

      return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
    }

    if (isPaymentCategory) {
      // Return individual payment rows
      const methodFilter = category === 'CASH_BALANCE'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? { method: { in: CASH_METHODS as any } }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : { method: category as any }

      const payments = await prisma.orderPayment.findMany({
        where: {
          ...methodFilter,
          order: {
            status: 'COMPLETED',
            transactionDate: { gte: startDate, lt: endDate },
            ...branchFilter,
          },
        },
        select: {
          method: true,
          amount: true,
          paymentModeId: true,
          order: {
            select: {
              transactionDate: true,
              orderType: true,
              branch: true,
              items: {
                take: 1,
                select: {
                  service: { select: { department: true } },
                  inventoryItem: { select: { skuDepartment: true } },
                },
              },
            },
          },
        },
        orderBy: { order: { transactionDate: 'asc' } },
      })

      const items = payments.map((p) => {
        const gross = Number(p.amount)
        const rate = p.paymentModeId ? (modeDeductionRate[p.paymentModeId] || 0) : 0
        const net = gross * (1 - rate / 100)
        const dept = p.order.items[0]?.service?.department || p.order.items[0]?.inventoryItem?.skuDepartment || 'OTHER'
        return {
          date: p.order.transactionDate.toISOString().split('T')[0],
          type: `${PAYMENT_LABELS[p.method] || p.method} — ${p.order.orderType === 'SERVICE' ? 'Service' : 'Product'} (${DEPT_LABELS[dept] || dept})`,
          branch: BRANCH_LABELS[p.order.branch] || p.order.branch,
          amount: net,
        }
      })

      return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
    }

    // Revenue / COGS drill-down
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderFilter: any = {
      status: 'COMPLETED',
      transactionDate: { gte: startDate, lt: endDate },
      ...branchFilter,
    }

    if (category === 'SERVICE_REVENUE') orderFilter.orderType = 'SERVICE'
    else if (category === 'PRODUCT_REVENUE') orderFilter.orderType = 'PRODUCT'
    else if (category === 'COGS') orderFilter.orderType = 'PRODUCT'
    else if (category === 'REVENUE') orderFilter.revenueType = { not: 'UNEARNED' }

    // When an accountKey is provided (e.g. "7020 Occupational Therapy Services Revenue"),
    // drill down to item-level and filter by matching revenue account
    if (accountKey && category === 'REVENUE') {
      const orders = await prisma.order.findMany({
        where: orderFilter,
        select: {
          transactionDate: true,
          orderType: true,
          branch: true,
          patientName: true,
          items: {
            select: {
              lineTotal: true,
              quantity: true,
              service: { select: { name: true, department: true, revenueAccount: { select: { accountNumber: true, accountTitle: true } } } },
              inventoryItem: { select: { name: true, skuDepartment: true, revenueAccount: { select: { accountNumber: true, accountTitle: true } } } },
            },
          },
        },
        orderBy: { transactionDate: 'asc' },
      })

      // Flatten to item-level, keeping only items matching the requested account
      const items: { date: string; type: string; branch: string; amount: number }[] = []
      for (const o of orders) {
        for (const item of o.items) {
          const acct = item.service?.revenueAccount || item.inventoryItem?.revenueAccount
          const itemKey = acct ? `${acct.accountNumber} ${acct.accountTitle}` : 'Unclassified Revenue'
          if (itemKey !== accountKey) continue

          const dept = item.service?.department || item.inventoryItem?.skuDepartment || 'OTHER'
          const name = item.service?.name || item.inventoryItem?.name || ''
          items.push({
            date: o.transactionDate.toISOString().split('T')[0],
            type: `${o.orderType === 'SERVICE' ? 'Service' : 'Product'} — ${DEPT_LABELS[dept] || dept}${name ? ` (${name})` : ''}`,
            branch: BRANCH_LABELS[o.branch] || o.branch,
            amount: Number(item.lineTotal),
          })
        }
      }

      return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
    }

    // Default: order-level drill-down (for totals or COGS)
    const orders = await prisma.order.findMany({
      where: orderFilter,
      select: {
        transactionDate: true,
        orderType: true,
        branch: true,
        netAmount: true,
        items: {
          select: {
            quantity: true,
            service: { select: { department: true } },
            inventoryItem: { select: { unitCost: true, skuDepartment: true } },
          },
        },
      },
      orderBy: { transactionDate: 'asc' },
    })

    const items = orders.map((o) => {
      const dept = o.items[0]?.service?.department || o.items[0]?.inventoryItem?.skuDepartment || 'OTHER'
      let amount = Number(o.netAmount)
      if (category === 'COGS') {
        amount = o.items.reduce((s, item) => {
          if (item.inventoryItem) return s + Number(item.inventoryItem.unitCost) * item.quantity
          return s
        }, 0)
      }
      return {
        date: o.transactionDate.toISOString().split('T')[0],
        type: `${o.orderType === 'SERVICE' ? 'Service' : 'Product'} — ${DEPT_LABELS[dept] || dept}`,
        branch: BRANCH_LABELS[o.branch] || o.branch,
        amount,
      }
    })

    return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
  } catch (err) {
    console.error('Drill-down API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
