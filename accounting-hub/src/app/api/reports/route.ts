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
    const [accounts, orders, inventoryItems, wallets, paymentModes, arPayments] = await Promise.all([
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
              cogsCost: true,
              inventoryItem: { select: { unitCost: true, skuDepartment: true, revenueAccount: { select: { accountNumber: true, accountTitle: true } }, expenseAccount: { select: { accountNumber: true, accountTitle: true } } } },
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

      // Payment modes with deduction rates (MDR, CWT) — include name + COA for reporting
      prisma.paymentMode.findMany({
        where: { isActive: true },
        select: { id: true, deductions: { select: { name: true, rate: true, accountId: true, account: { select: { accountNumber: true, accountTitle: true, accountType: true } } } } },
      }),

      // AR Payments — for tracking cash received from HMO/GL and reducing AR balance
      prisma.aRPayment.findMany({
        where: {
          paymentDate: { gte: startDate, lt: endDate },
          ...(branch !== 'ALL' ? { branch } : {}),
        },
        select: {
          amount: true,
          discount: true,
          paymentDate: true,
          cashAccountId: true,
          cashAccount: { select: { accountNumber: true, accountTitle: true } },
          discountAccountId: true,
          discountAccount: { select: { accountNumber: true, accountTitle: true } },
        },
      }),
    ])

    // Build deduction rate map: paymentModeId → total deduction %
    const modeDeductionRate: Record<string, number> = {}
    // Build per-deduction-type breakdown: paymentModeId → [{ name, rate, accountKey, accountType }]
    const modeDeductionBreakdown: Record<string, { name: string; rate: number; accountKey: string | null; accountType: string | null }[]> = {}
    for (const pm of paymentModes) {
      modeDeductionRate[pm.id] = pm.deductions.reduce((s, d) => s + Number(d.rate), 0)
      modeDeductionBreakdown[pm.id] = pm.deductions.map(d => ({
        name: d.name,
        rate: Number(d.rate),
        accountKey: d.account ? `${d.account.accountNumber} ${d.account.accountTitle}` : null,
        accountType: d.account?.accountType || null,
      }))
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
      cogsByAccount: Record<string, number>
      cashReceived: number
      paymentsByMethod: Record<string, number>
      deductionsByMethod: Record<string, number>
      deductionsByType: Record<string, number>  // e.g. "Merchant Discount Rate" → total ₱ amount
      deductionsByAccount: Record<string, number>  // COA account key → total ₱ amount (for balance sheet assets like CWT)
    }

    const monthly: Record<number, MonthData> = {}
    for (let m = 1; m <= 12; m++) {
      monthly[m] = {
        serviceRevenue: 0, productRevenue: 0, unearnedRevenue: 0,
        cogs: 0, revenueByDept: {}, revenueByAccount: {},
        revenueByBranch: {}, cogsByDept: {}, cogsByAccount: {}, cashReceived: 0,
        paymentsByMethod: {}, deductionsByMethod: {}, deductionsByType: {},
        deductionsByAccount: {},
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

        // Group by assigned COA revenue account (skip unearned — they go to liabilities, not IS)
        if (order.revenueType !== 'UNEARNED') {
          const acct = item.service?.revenueAccount || item.inventoryItem?.revenueAccount
          const acctKey = acct ? `${acct.accountNumber} ${acct.accountTitle}` : 'Unclassified Revenue'
          m.revenueByAccount[acctKey] = (m.revenueByAccount[acctKey] || 0) + lineAmt
        }

        if (item.inventoryItemId && item.inventoryItem) {
          // Prefer FIFO cogsCost (recorded at order time), fall back to unitCost × qty
          const cost = item.cogsCost ? Number(item.cogsCost) : Number(item.inventoryItem.unitCost) * item.quantity
          m.cogs += cost
          m.cogsByDept[dept] = (m.cogsByDept[dept] || 0) + cost

          // Group COGS by expense account (e.g., "5010 Cost of Goods Sold")
          const expAcct = item.inventoryItem.expenseAccount
          const expKey = expAcct ? `${expAcct.accountNumber} ${expAcct.accountTitle}` : 'Unclassified COGS'
          m.cogsByAccount[expKey] = (m.cogsByAccount[expKey] || 0) + cost
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

        // Track per-deduction-type amounts (MDR, CWT individually)
        // Route to COA accounts based on account type:
        //   REVENUE (e.g. 7140 MDR) → revenueByAccount (shows in Income Statement discounts)
        //   ASSET (e.g. 1140 CWT) → deductionsByAccount (shows in Balance Sheet current assets)
        if (p.paymentModeId && modeDeductionBreakdown[p.paymentModeId]) {
          for (const ded of modeDeductionBreakdown[p.paymentModeId]) {
            const dedAmt = gross * (ded.rate / 100)
            if (dedAmt > 0 && ded.accountKey) {
              m.deductionsByType[ded.name] = (m.deductionsByType[ded.name] || 0) + dedAmt
              if (ded.accountType === 'REVENUE') {
                // MDR → Income Statement under Discounts & Refunds
                m.revenueByAccount[ded.accountKey] = (m.revenueByAccount[ded.accountKey] || 0) + dedAmt
              }
              if (ded.accountType === 'ASSET') {
                // CWT → Balance Sheet under Current Assets
                m.deductionsByAccount[ded.accountKey] = (m.deductionsByAccount[ded.accountKey] || 0) + dedAmt
              }
            }
          }
        }
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

    /* ── Wallet / unearned revenue + Accounts Receivable ─────── */

    const AR_WALLET_TYPES = new Set(['HMO', 'GL'])
    const walletByType: Record<string, number> = {}
    let totalWalletBalance = 0
    let totalARBalance = 0
    const arByType: Record<string, number> = {}
    for (const w of wallets) {
      const bal = Number(w.balance)
      if (AR_WALLET_TYPES.has(w.walletType)) {
        // HMO/GL = Accounts Receivable (asset)
        totalARBalance += bal
        arByType[w.walletType] = (arByType[w.walletType] || 0) + bal
      } else {
        // Package, VIP, Prepaid Card, etc. = Unearned Revenue (liability)
        totalWalletBalance += bal
        walletByType[w.walletType] = (walletByType[w.walletType] || 0) + bal
      }
    }

    /* ── AR Payment aggregation (cash received from HMO/GL) ──── */

    let totalARPaymentsReceived = 0
    let totalARDiscounts = 0
    const arPaymentsByCashAccount: Record<string, { accountNumber: string; accountTitle: string; amount: number }> = {}
    for (const p of arPayments) {
      const amt = Number(p.amount)
      const disc = Number(p.discount)
      totalARPaymentsReceived += amt
      totalARDiscounts += disc
      if (p.cashAccountId && p.cashAccount) {
        const key = `${p.cashAccount.accountNumber} ${p.cashAccount.accountTitle}`
        if (!arPaymentsByCashAccount[key]) {
          arPaymentsByCashAccount[key] = { accountNumber: p.cashAccount.accountNumber, accountTitle: p.cashAccount.accountTitle, amount: 0 }
        }
        arPaymentsByCashAccount[key].amount += amt
      }
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
      accountsReceivable: {
        total: totalARBalance,
        byType: arByType,
        paymentsReceived: totalARPaymentsReceived,
        discounts: totalARDiscounts,
        byCashAccount: Object.values(arPaymentsByCashAccount),
      },
      inventorySourceAccounts: Object.values(inventoryBySourceAccount),
      unclassifiedAP,
    })
  } catch (err) {
    console.error('Reports API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
