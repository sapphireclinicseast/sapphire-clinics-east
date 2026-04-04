import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
  const branch = searchParams.get('branch') || 'ALL'

  const startDate = new Date(`${year}-01-01T00:00:00.000Z`)
  const endDate = new Date(`${year + 1}-01-01T00:00:00.000Z`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const branchFilter: any = branch !== 'ALL' ? { branch } : {}

  try {
    const [accounts, orders, inventoryItems, wallets, paymentModes] = await Promise.all([
      // Chart of Accounts — structure for report line items
      prisma.account.findMany({
        where: { isActive: true },
        select: {
          accountNumber: true,
          accountTitle: true,
          accountType: true,
          subType: true,
          subSubType: true,
          normalBalance: true,
          currency: true,
        },
        orderBy: { accountNumber: 'asc' },
      }),

      // POS Orders for the year — revenue, COGS, and cash flow data
      prisma.order.findMany({
        where: {
          status: 'COMPLETED',
          transactionDate: { gte: startDate, lt: endDate },
          ...branchFilter,
        },
        select: {
          netAmount: true,
          orderType: true,
          branch: true,
          revenueType: true,
          transactionDate: true,
          items: {
            select: {
              inventoryItemId: true,
              quantity: true,
              lineTotal: true,
              service: { select: { department: true, revenueAccount: { select: { accountNumber: true, accountTitle: true } } } },
              inventoryItem: { select: { unitCost: true, skuDepartment: true, revenueAccount: { select: { accountNumber: true, accountTitle: true } } } },
            },
          },
          payments: {
            select: { method: true, amount: true, paymentModeId: true },
          },
        },
      }),

      // Inventory items — balance sheet inventory valuation
      prisma.inventoryItem.findMany({
        where: {
          isActive: true,
          ...(branch !== 'ALL' ? { branch: branch as 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' | 'VERDANA_STORE' } : {}),
        },
        select: { quantity: true, unitCost: true, skuDepartment: true, branch: true, sourceAccountId: true, sourceAccount: { select: { accountNumber: true, accountTitle: true } } },
      }),

      // Digital wallets — unearned revenue (liability)
      prisma.digitalWallet.findMany({
        where: { isActive: true },
        select: { walletType: true, balance: true },
      }),

      // Payment modes with deduction rates (MDR, CWT)
      prisma.paymentMode.findMany({
        where: { isActive: true },
        select: { id: true, deductions: { select: { rate: true } } },
      }),
    ])

    // Build deduction rate map: paymentModeId → total deduction %
    const modeDeductionRate: Record<string, number> = {}
    for (const pm of paymentModes) {
      modeDeductionRate[pm.id] = pm.deductions.reduce((s, d) => s + Number(d.rate), 0)
    }

    /* ── Aggregate monthly data ────────────────────────────────── */

    const CASH_METHODS = new Set(['CASH', 'GCASH', 'PAYMAYA', 'DEBIT', 'CREDIT_CARD', 'SHOPEE', 'LAZADA', 'TIKTOK'])

    interface MonthData {
      serviceRevenue: number
      productRevenue: number
      unearnedRevenue: number
      cogs: number
      revenueByDept: Record<string, number>
      revenueByAccount: Record<string, number>
      revenueByBranch: Record<string, number>
      cogsByDept: Record<string, number>
      cashReceived: number
      paymentsByMethod: Record<string, number>
      deductionsByMethod: Record<string, number>
    }

    const monthly: Record<number, MonthData> = {}
    for (let m = 1; m <= 12; m++) {
      monthly[m] = {
        serviceRevenue: 0, productRevenue: 0, unearnedRevenue: 0,
        cogs: 0, revenueByDept: {}, revenueByAccount: {},
        revenueByBranch: {}, cogsByDept: {}, cashReceived: 0,
        paymentsByMethod: {}, deductionsByMethod: {},
      }
    }

    for (const order of orders) {
      const month = new Date(order.transactionDate).getMonth() + 1
      const net = Number(order.netAmount)
      const m = monthly[month]

      // Revenue classification
      if (order.revenueType === 'UNEARNED') {
        m.unearnedRevenue += net
      } else if (order.orderType === 'SERVICE') {
        m.serviceRevenue += net
      } else {
        m.productRevenue += net
      }

      // Revenue by branch
      m.revenueByBranch[order.branch] = (m.revenueByBranch[order.branch] || 0) + net

      // Revenue by department, by COA account + COGS from product items
      for (const item of order.items) {
        const dept = item.service?.department || item.inventoryItem?.skuDepartment || 'OTHER'
        const lineAmt = Number(item.lineTotal)
        m.revenueByDept[dept] = (m.revenueByDept[dept] || 0) + lineAmt

        // Group by assigned COA revenue account
        const acct = item.service?.revenueAccount || item.inventoryItem?.revenueAccount
        const acctKey = acct ? `${acct.accountNumber} ${acct.accountTitle}` : 'Unclassified Revenue'
        m.revenueByAccount[acctKey] = (m.revenueByAccount[acctKey] || 0) + lineAmt

        if (item.inventoryItemId && item.inventoryItem) {
          const cost = Number(item.inventoryItem.unitCost) * item.quantity
          m.cogs += cost
          m.cogsByDept[dept] = (m.cogsByDept[dept] || 0) + cost
        }
      }

      // Payments by method — net of deductions (MDR, CWT)
      for (const p of order.payments) {
        const gross = Number(p.amount)
        const rate = p.paymentModeId ? (modeDeductionRate[p.paymentModeId] || 0) : 0
        const net = gross * (1 - rate / 100)
        const deduction = gross - net
        m.paymentsByMethod[p.method] = (m.paymentsByMethod[p.method] || 0) + net
        if (deduction > 0) {
          m.deductionsByMethod[p.method] = (m.deductionsByMethod[p.method] || 0) + deduction
        }
        if (CASH_METHODS.has(p.method)) m.cashReceived += net
      }
    }

    /* ── Inventory valuation ───────────────────────────────────── */

    const inventoryByDept: Record<string, number> = {}
    let totalInventory = 0
    for (const item of inventoryItems) {
      const val = Number(item.unitCost) * item.quantity
      totalInventory += val
      inventoryByDept[item.skuDepartment] = (inventoryByDept[item.skuDepartment] || 0) + val
    }

    /* ── Inventory source account balances (Accounts Payable / Cash) ── */
    const inventoryBySourceAccount: Record<string, { accountNumber: string; accountTitle: string; amount: number }> = {}
    let unclassifiedAP = 0
    for (const item of inventoryItems) {
      const val = Number(item.unitCost) * item.quantity
      if (item.sourceAccountId && item.sourceAccount) {
        const key = item.sourceAccountId
        if (!inventoryBySourceAccount[key]) {
          inventoryBySourceAccount[key] = { accountNumber: item.sourceAccount.accountNumber, accountTitle: item.sourceAccount.accountTitle, amount: 0 }
        }
        inventoryBySourceAccount[key].amount += val
      } else {
        unclassifiedAP += val
      }
    }

    /* ── Wallet / unearned revenue ─────────────────────────────── */

    const walletByType: Record<string, number> = {}
    let totalWalletBalance = 0
    for (const w of wallets) {
      const bal = Number(w.balance)
      totalWalletBalance += bal
      walletByType[w.walletType] = (walletByType[w.walletType] || 0) + bal
    }

    /* ── Group accounts ────────────────────────────────────────── */

    const groupedAccounts: Record<string, Record<string, { accountNumber: string; accountTitle: string; subSubType: string | null; normalBalance: string; currency: string }[]>> = {}
    for (const acct of accounts) {
      const t = acct.accountType
      if (!groupedAccounts[t]) groupedAccounts[t] = {}
      const sub = acct.subType || 'UNCATEGORIZED'
      if (!groupedAccounts[t][sub]) groupedAccounts[t][sub] = []
      groupedAccounts[t][sub].push({
        accountNumber: acct.accountNumber,
        accountTitle: acct.accountTitle,
        subSubType: acct.subSubType,
        normalBalance: acct.normalBalance,
        currency: acct.currency,
      })
    }

    return NextResponse.json({
      year,
      branch,
      accounts: groupedAccounts,
      monthly,
      inventory: { total: totalInventory, byDepartment: inventoryByDept },
      wallets: { total: totalWalletBalance, byType: walletByType },
      inventorySourceAccounts: Object.values(inventoryBySourceAccount),
      unclassifiedAP,
    })
  } catch (err) {
    console.error('Reports API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
