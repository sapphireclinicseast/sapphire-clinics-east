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

  // Map short branch codes to Order model branch enum values
  const BRANCH_MAP: Record<string, string> = {
    SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS',
    VERDANA_STORE: 'VERDANA_STORE', SANDBOX_EAST: 'SANDBOX_EAST', SANDBOX_GREENHILLS: 'SANDBOX_GREENHILLS',
  }
  const orderBranch = BRANCH_MAP[branch] || branch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const branchFilter: any = branch !== 'ALL' ? { branch: orderBranch } : {}

  try {
    // ── Payroll expense detail (8190 Professional Fees — per consultant row) ──
    if (category === 'PAYROLL_EXPENSE_DETAIL') {
      const cutoffPrefix = month > 0
        ? `${year}-${String(month).padStart(2, '0')}`
        : String(year)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { status: 'LOCKED', cutoffPeriod: { startsWith: cutoffPrefix } }
      if (branch !== 'ALL') where.branch = branch

      const entries = await prisma.payrollEntry.findMany({
        where,
        include: { consultant: { select: { name: true, department: true } } },
        orderBy: [{ cutoffPeriod: 'asc' }, { branch: 'asc' }],
      })

      const items = entries.map(e => ({
        date: e.cutoffPeriod,
        type: `${e.consultant?.name || '—'}${e.consultant?.department ? ` · ${DEPT_LABELS[e.consultant.department] || e.consultant.department}` : ''}`,
        branch: BRANCH_LABELS[e.branch] || e.branch,
        amount: Number(e.grossPay),
      }))
      return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
    }

    // ── Unremitted salary payable detail (4060 — current balance) ──
    if (category === 'SALARY_PAYABLE_DETAIL') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const branchWhere: any = branch !== 'ALL' ? { branch } : {}

      const [consultantEntries, employeePayslips] = await Promise.all([
        prisma.payrollEntry.findMany({
          where: { salariesRemitted: false, status: 'LOCKED', ...branchWhere },
          include: { consultant: { select: { name: true, department: true } } },
          orderBy: [{ cutoffPeriod: 'asc' }],
        }),
        prisma.employeePayslip.findMany({
          where: { salariesRemitted: false, status: { in: ['FINAL', 'LOCKED'] }, ...branchWhere },
          include: { employee: { select: { firstName: true, lastName: true, department: true } } },
          orderBy: [{ cutoffPeriod: 'asc' }],
        }),
      ])

      const items = [
        ...consultantEntries.map(e => ({
          date: e.cutoffPeriod,
          type: `${e.consultant?.name || '—'} (Consultant${e.consultant?.department ? ` · ${DEPT_LABELS[e.consultant.department] || e.consultant.department}` : ''})`,
          branch: BRANCH_LABELS[e.branch] || e.branch,
          amount: Number(e.netPay),
        })),
        ...employeePayslips.map(p => ({
          date: p.cutoffPeriod,
          type: `${p.employee.firstName} ${p.employee.lastName} (Employee${p.employee.department ? ` · ${DEPT_LABELS[p.employee.department] || p.employee.department}` : ''})`,
          branch: BRANCH_LABELS[p.branch] || p.branch,
          amount: Number(p.netPay),
        })),
      ].sort((a, b) => a.date.localeCompare(b.date))

      return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
    }

    // ── Unremitted tax payable detail (4070 — current balance) ──
    if (category === 'TAX_PAYABLE_DETAIL') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const branchWhere: any = branch !== 'ALL' ? { branch } : {}

      const [consultantEntries, employeePayslips] = await Promise.all([
        prisma.payrollEntry.findMany({
          where: { taxRemitted: false, taxAmount: { gt: 0 }, ...branchWhere },
          include: { consultant: { select: { name: true, department: true } } },
          orderBy: [{ cutoffPeriod: 'asc' }],
        }),
        prisma.employeePayslip.findMany({
          where: { taxRemitted: false, taxDeduction: { gt: 0 }, ...branchWhere },
          include: { employee: { select: { firstName: true, lastName: true, department: true } } },
          orderBy: [{ cutoffPeriod: 'asc' }],
        }),
      ])

      const items = [
        ...consultantEntries.map(e => ({
          date: e.cutoffPeriod,
          type: `${e.consultant?.name || '—'} (Consultant${e.consultant?.department ? ` · ${DEPT_LABELS[e.consultant.department] || e.consultant.department}` : ''})`,
          branch: BRANCH_LABELS[e.branch] || e.branch,
          amount: Number(e.taxAmount),
        })),
        ...employeePayslips.map(p => ({
          date: p.cutoffPeriod,
          type: `${p.employee.firstName} ${p.employee.lastName} (Employee${p.employee.department ? ` · ${DEPT_LABELS[p.employee.department] || p.employee.department}` : ''})`,
          branch: BRANCH_LABELS[p.branch] || p.branch,
          amount: Number(p.taxDeduction),
        })),
      ].sort((a, b) => a.date.localeCompare(b.date))

      return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
    }

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
    const isARIncrease = category.startsWith('AR_INCREASE_')
    const isARPayments = category === 'AR_PAYMENTS'
    const isJournalAccount = category === 'JOURNAL_ACCOUNT'

    // Journal entry drill-down (for payable accounts like 4060, 4070, 4040, etc.)
    if (isJournalAccount && accountKey) {
      const [acctNum, ...titleParts] = accountKey.split(' ')
      const acctTitle = titleParts.join(' ')

      const lines = await prisma.journalEntryLine.findMany({
        where: {
          account: { accountNumber: acctNum, accountTitle: acctTitle },
          journalEntry: {
            entryDate: { gte: startDate, lt: endDate },
          },
        },
        select: {
          debit: true,
          credit: true,
          description: true,
          account: { select: { accountType: true } },
          journalEntry: { select: { entryDate: true, description: true, referenceType: true } },
        },
        orderBy: { journalEntry: { entryDate: 'asc' } },
      })

      const items = lines.map(line => {
        const credit = Number(line.credit) || 0
        const debit = Number(line.debit) || 0
        const isLiability = line.account?.accountType === 'LIABILITY' || line.account?.accountType === 'REVENUE' || line.account?.accountType === 'EQUITY'
        const amount = isLiability ? (credit - debit) : (debit - credit)
        return {
          date: line.journalEntry.entryDate.toISOString().split('T')[0],
          type: `${line.journalEntry.description}${line.description ? ` — ${line.description}` : ''}`,
          branch: line.journalEntry.referenceType || '—',
          amount,
        }
      })

      return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
    }

    // Wallet balances drill-down (unearned revenue)
    if (category === 'WALLET_BALANCE') {
      const wallets = await prisma.digitalWallet.findMany({
        where: { isActive: true, balance: { gt: 0 } },
        select: { patientName: true, walletType: true, balance: true, createdAt: true },
        orderBy: { walletType: 'asc' },
      })
      const items = wallets.map(w => ({
        date: w.createdAt.toISOString().split('T')[0],
        type: `${w.walletType} — ${w.patientName}`,
        branch: '—',
        amount: Number(w.balance),
      }))
      return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
    }

    // AR Payments Received drill-down (collections from HMO/GL via Record Payment)
    if (isARPayments) {
      const arPayments = await prisma.aRPayment.findMany({
        where: {
          paymentDate: { gte: startDate, lt: endDate },
          ...(branch !== 'ALL' ? { branch } : {}),
        },
        select: {
          paymentDate: true,
          amount: true,
          discount: true,
          notes: true,
          branch: true,
          cashAccount: { select: { accountNumber: true, accountTitle: true } },
          wallet: { select: { patientName: true, walletType: true } },
          items: { select: { order: { select: { orderNumber: true, patientName: true } } } },
        },
        orderBy: { paymentDate: 'asc' },
      })

      const items = arPayments.map((p) => {
        const amt = Number(p.amount)
        const walletLabel = p.wallet.walletType === 'HMO' ? 'HMO' : 'GL'
        const cashAcct = p.cashAccount ? `${p.cashAccount.accountNumber} ${p.cashAccount.accountTitle}` : ''
        const orderNums = p.items.map(i => `#${i.order.orderNumber}`).join(', ')
        return {
          date: p.paymentDate.toISOString().split('T')[0],
          type: `${walletLabel} — ${p.wallet.patientName}${orderNums ? ` (${orderNums})` : ''}${cashAcct ? ` → ${cashAcct}` : ''}`,
          branch: BRANCH_LABELS[p.branch || ''] || p.branch || '—',
          amount: amt,
        }
      })

      return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
    }

    // AR Increase drill-down (HMO/GL charges — orders billed to AR)
    if (isARIncrease) {
      const arMethod = category.replace('AR_INCREASE_', '') // 'HMO' or 'GL'

      const payments = await prisma.orderPayment.findMany({
        where: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          method: arMethod as any,
          order: {
            status: 'COMPLETED',
            transactionDate: { gte: startDate, lt: endDate },
            ...branchFilter,
          },
        },
        select: {
          method: true,
          amount: true,
          wallet: { select: { patientName: true } },
          order: {
            select: {
              orderNumber: true,
              transactionDate: true,
              orderType: true,
              branch: true,
              patientName: true,
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
        const dept = p.order.items[0]?.service?.department || p.order.items[0]?.inventoryItem?.skuDepartment || 'OTHER'
        const walletName = p.wallet?.patientName || ''
        return {
          date: p.order.transactionDate.toISOString().split('T')[0],
          type: `#${p.order.orderNumber} — ${p.order.orderType === 'SERVICE' ? 'Service' : 'Product'} (${DEPT_LABELS[dept] || dept})${p.order.patientName ? ` · ${p.order.patientName}` : ''}${walletName ? ` → ${walletName}` : ''}`,
          branch: BRANCH_LABELS[p.order.branch] || p.order.branch,
          amount: Number(p.amount),
        }
      })

      return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
    }

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

      // If no payment mode deductions match, this might be an order-level discount (PWD/SC, Custom)
      if (matchingModeIds.length === 0) {
        const discountSettings = await prisma.discountSetting.findMany({
          where: { isActive: true },
          select: { name: true, account: { select: { accountNumber: true, accountTitle: true } } },
        })

        // Determine which discount setting names map to this accountKey
        const matchingSettingNames: string[] = []
        let isPwdScAccount = false
        let isOtherDiscountsAccount = false
        for (const ds of discountSettings) {
          if (!ds.account) continue
          const dsKey = `${ds.account.accountNumber} ${ds.account.accountTitle}`
          if (ds.name === accountKey || dsKey === accountKey || ds.account.accountTitle === accountKey) {
            matchingSettingNames.push(ds.name)
            if (ds.name.toLowerCase().includes('pwd') || ds.name.toLowerCase().includes('senior')) {
              isPwdScAccount = true
            }
            if (ds.account.accountNumber === '7210') {
              isOtherDiscountsAccount = true
            }
          }
        }

        // Get all discounted orders and filter using the same logic as the reports API
        const discountOrders = await prisma.order.findMany({
          where: {
            status: 'COMPLETED',
            transactionDate: { gte: startDate, lt: endDate },
            ...branchFilter,
            discountAmount: { gt: 0 },
          },
          select: {
            orderNumber: true,
            transactionDate: true,
            orderType: true,
            branch: true,
            patientName: true,
            discountAmount: true,
            discountType: true,
            discountLabel: true,
            items: {
              take: 1,
              select: {
                service: { select: { department: true } },
                inventoryItem: { select: { skuDepartment: true } },
              },
            },
          },
          orderBy: { transactionDate: 'asc' },
        })

        // Build discountLabel → accountKey map (same as reports API)
        const labelToKey: Record<string, string> = {}
        let pwdScKey = ''
        let otherKey = ''
        for (const ds of discountSettings) {
          if (ds.account) {
            const k = `${ds.account.accountNumber} ${ds.account.accountTitle}`
            labelToKey[ds.name] = k
            if (ds.name.toLowerCase().includes('pwd') || ds.name.toLowerCase().includes('senior')) pwdScKey = k
            if (ds.account.accountNumber === '7210') otherKey = k
          }
        }
        labelToKey['PWD/Senior Citizen (20%)'] = pwdScKey

        // Filter orders that would route to the requested accountKey
        const items = discountOrders.filter((o) => {
          let resolvedKey = ''
          if (o.discountType === 'PWD_SC' && pwdScKey) resolvedKey = pwdScKey
          if (!resolvedKey && o.discountLabel) resolvedKey = labelToKey[o.discountLabel] || ''
          if (!resolvedKey && o.discountLabel) {
            const ll = o.discountLabel.toLowerCase()
            for (const [name, key] of Object.entries(labelToKey)) {
              if (ll.includes(name.toLowerCase()) || name.toLowerCase().includes(ll)) { resolvedKey = key; break }
            }
          }
          if (!resolvedKey && otherKey) resolvedKey = otherKey
          // Match against the requested accountKey (full key or account title)
          return resolvedKey === accountKey || resolvedKey.split(' ').slice(1).join(' ') === accountKey
            || (matchingSettingNames.length > 0 && resolvedKey === `${matchingSettingNames[0]}`)
        }).map((o) => {
          const dept = o.items[0]?.service?.department || o.items[0]?.inventoryItem?.skuDepartment || 'OTHER'
          return {
            date: o.transactionDate.toISOString().split('T')[0],
            type: `#${o.orderNumber} — ${o.discountLabel || o.discountType || 'Discount'} (${DEPT_LABELS[dept] || dept})${o.patientName ? ` · ${o.patientName}` : ''}`,
            branch: BRANCH_LABELS[o.branch] || o.branch,
            amount: Number(o.discountAmount),
          }
        })

        return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
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
              orderNumber: true,
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
          type: `#${p.order.orderNumber} — ${info.modeName} ${PAYMENT_LABELS[p.method] || p.method} (${DEPT_LABELS[dept] || dept}) · ₱${gross.toLocaleString()} × ${info.rate}%${p.order.patientName ? ` · ${p.order.patientName}` : ''}`,
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
      // Fetch name→account lookups for items missing service/inventory relations
      const [svcLookup, invLookup] = await Promise.all([
        prisma.service.findMany({
          where: { isActive: true, revenueAccountId: { not: null } },
          select: { name: true, department: true, revenueAccount: { select: { accountNumber: true, accountTitle: true } } },
        }),
        prisma.inventoryItem.findMany({
          where: { isActive: true, revenueAccountId: { not: null } },
          select: { name: true, skuDepartment: true, revenueAccount: { select: { accountNumber: true, accountTitle: true } } },
        }),
      ])
      const svcNameMap: Record<string, { acctKey: string; dept: string; name: string }> = {}
      for (const s of svcLookup) {
        if (s.revenueAccount) {
          svcNameMap[s.name.trim().toUpperCase()] = {
            acctKey: `${s.revenueAccount.accountNumber} ${s.revenueAccount.accountTitle}`,
            dept: s.department, name: s.name,
          }
        }
      }
      const invNameMap: Record<string, { acctKey: string; dept: string; name: string }> = {}
      for (const i of invLookup) {
        if (i.revenueAccount) {
          invNameMap[i.name.trim().toUpperCase()] = {
            acctKey: `${i.revenueAccount.accountNumber} ${i.revenueAccount.accountTitle}`,
            dept: i.skuDepartment, name: i.name,
          }
        }
      }

      const orders = await prisma.order.findMany({
        where: orderFilter,
        select: {
          orderNumber: true,
          transactionDate: true,
          orderType: true,
          branch: true,
          patientName: true,
          items: {
            select: {
              name: true,
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
          // Resolve account: direct relation first, then name-based fallback
          let itemKey: string
          const acct = item.service?.revenueAccount || item.inventoryItem?.revenueAccount
          if (acct) {
            itemKey = `${acct.accountNumber} ${acct.accountTitle}`
          } else {
            const nameKey = item.name?.trim().toUpperCase() || ''
            itemKey = svcNameMap[nameKey]?.acctKey || invNameMap[nameKey]?.acctKey || 'Unclassified Revenue'
          }
          if (itemKey !== accountKey) continue

          const dept = item.service?.department || item.inventoryItem?.skuDepartment
            || svcNameMap[item.name?.trim().toUpperCase() || '']?.dept
            || invNameMap[item.name?.trim().toUpperCase() || '']?.dept || 'OTHER'
          const name = item.service?.name || item.inventoryItem?.name || item.name || ''
          items.push({
            date: o.transactionDate.toISOString().split('T')[0],
            type: `#${o.orderNumber} — ${o.orderType === 'SERVICE' ? 'Service' : 'Product'} (${DEPT_LABELS[dept] || dept})${name ? ` · ${name}` : ''}${o.patientName ? ` · ${o.patientName}` : ''}`,
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
