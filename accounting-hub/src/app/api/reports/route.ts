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

  // Map short branch codes to Order model branch enum values
  const BRANCH_MAP: Record<string, string> = {
    SBEA: 'SANDBOX_EAST',
    SBGH: 'SANDBOX_GREENHILLS',
    VERDANA_STORE: 'VERDANA_STORE',
    SANDBOX_EAST: 'SANDBOX_EAST',
    SANDBOX_GREENHILLS: 'SANDBOX_GREENHILLS',
  }
  const orderBranch = BRANCH_MAP[branch] || branch

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const branchFilter: any = branch !== 'ALL' ? { branch: orderBranch } : {}

  try {
    const [accounts, orders, inventoryItems, wallets, paymentModes, arPayments, journalLines, discountSettings, allServices, allInventory, assets, beginningBalances] = await Promise.all([
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
          subtotal: true,
          discountAmount: true,
          discountType: true,
          discountLabel: true,
          orderType: true,
          branch: true,
          revenueType: true,
          transactionDate: true,
          items: {
            select: {
              name: true,
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
          ...(branch !== 'ALL' ? { branch: orderBranch as 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' | 'VERDANA_STORE' } : {}),
        },
        select: { quantity: true, unitCost: true, skuDepartment: true, branch: true, sourceAccountId: true, sourceAccount: { select: { accountNumber: true, accountTitle: true, accountType: true } } },
      }),

      // Digital wallets — unearned revenue (liability) + AR (HMO/GL)
      prisma.digitalWallet.findMany({
        where: { isActive: true },
        select: { walletType: true, balance: true, totalGlAmount: true },
      }),

      // Payment modes with deduction rates (MDR, CWT) + COA account for cash routing
      prisma.paymentMode.findMany({
        where: { isActive: true },
        select: {
          id: true,
          account: { select: { accountNumber: true, accountTitle: true } },
          deductions: { select: { name: true, rate: true, accountId: true, account: { select: { accountNumber: true, accountTitle: true, accountType: true } } } },
        },
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

      // Journal entry lines — for payroll payables, benefit payments, salary payments, etc.
      prisma.journalEntryLine.findMany({
        where: {
          journalEntry: {
            entryDate: { gte: startDate, lt: endDate },
            ...(branch !== 'ALL' ? { branch } : {}),
          },
        },
        select: {
          debit: true,
          credit: true,
          description: true,
          account: { select: { id: true, accountNumber: true, accountTitle: true, accountType: true } },
          journalEntry: { select: { id: true, entryDate: true, description: true, referenceType: true } },
        },
      }),

      // Discount settings — links discount labels to COA accounts
      prisma.discountSetting.findMany({
        where: { isActive: true },
        select: {
          name: true,
          account: { select: { accountNumber: true, accountTitle: true } },
        },
      }),

      // All services — name→revenueAccount lookup for unlinked order items
      prisma.service.findMany({
        where: { isActive: true, revenueAccountId: { not: null } },
        select: {
          name: true,
          department: true,
          revenueAccount: { select: { accountNumber: true, accountTitle: true } },
        },
      }),

      // All inventory items — name→revenueAccount lookup for unlinked order items
      prisma.inventoryItem.findMany({
        where: { isActive: true, revenueAccountId: { not: null } },
        select: {
          name: true,
          skuDepartment: true,
          revenueAccount: { select: { accountNumber: true, accountTitle: true } },
          expenseAccount: { select: { accountNumber: true, accountTitle: true } },
          unitCost: true,
        },
      }),

      // Assets — for depreciation on Income Statement and Balance Sheet
      prisma.asset.findMany({
        where: branch !== 'ALL' ? { branch: orderBranch as 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' | 'VERDANA_STORE' } : {},
        select: {
          name: true,
          classification: true,
          branch: true,
          totalAmount: true,
          monthlyDepreciation: true,
          dateBought: true,
          depreciationEndDate: true,
        },
      }),

      // Tier 2.1: Opening balances for the fiscal year (Cash, Owner's Equity,
      // Retained Earnings). Without these the BS reflects only flows, not state.
      prisma.beginningBalance.findMany({
        where: { periodYear: year },
        select: {
          amount: true,
          account: { select: { accountNumber: true, accountTitle: true, accountType: true } },
        },
      }),
    ])

    // Build deduction rate map: paymentModeId → total deduction %
    const modeDeductionRate: Record<string, number> = {}
    // Build per-deduction-type breakdown: paymentModeId → [{ name, rate, accountKey, accountType }]
    const modeDeductionBreakdown: Record<string, { name: string; rate: number; accountKey: string | null; accountType: string | null }[]> = {}
    // Build payment mode → COA account map for cash routing
    const modeAccountKey: Record<string, string> = {}
    for (const pm of paymentModes) {
      modeDeductionRate[pm.id] = pm.deductions.reduce((s, d) => s + Number(d.rate), 0)
      modeDeductionBreakdown[pm.id] = pm.deductions.map(d => ({
        name: d.name,
        rate: Number(d.rate),
        accountKey: d.account ? `${d.account.accountNumber} ${d.account.accountTitle}` : null,
        accountType: d.account?.accountType || null,
      }))
      if (pm.account) {
        modeAccountKey[pm.id] = `${pm.account.accountNumber} ${pm.account.accountTitle}`
      }
    }

    // Build discount label → COA account key map from DiscountSettings
    const discountLabelToAccount: Record<string, string> = {}
    let pwdScAccountKey = ''
    let otherDiscountAccountKey = ''
    for (const ds of discountSettings) {
      if (ds.account) {
        const acctKey = `${ds.account.accountNumber} ${ds.account.accountTitle}`
        discountLabelToAccount[ds.name] = acctKey
        // Identify key accounts for type-based fallback
        if (ds.name.toLowerCase().includes('pwd') || ds.name.toLowerCase().includes('senior')) {
          pwdScAccountKey = acctKey
        }
        // Use 7210 Other Discounts as the generic fallback for unmatched custom discounts
        if (ds.account.accountNumber === '7210') {
          otherDiscountAccountKey = acctKey
        }
      }
    }
    // Map the built-in PWD/SC label to its account
    if (pwdScAccountKey) {
      discountLabelToAccount['PWD/Senior Citizen (20%)'] = pwdScAccountKey
    }

    // Build name→revenueAccount lookup for order items that are missing service/inventory relations
    const serviceNameToAccount: Record<string, { accountKey: string; department: string }> = {}
    for (const svc of allServices) {
      if (svc.revenueAccount) {
        serviceNameToAccount[svc.name.trim().toUpperCase()] = {
          accountKey: `${svc.revenueAccount.accountNumber} ${svc.revenueAccount.accountTitle}`,
          department: svc.department,
        }
      }
    }
    const inventoryNameToAccount: Record<string, { accountKey: string; department: string; expenseKey: string | null; unitCost: number }> = {}
    for (const inv of allInventory) {
      if (inv.revenueAccount) {
        inventoryNameToAccount[inv.name.trim().toUpperCase()] = {
          accountKey: `${inv.revenueAccount.accountNumber} ${inv.revenueAccount.accountTitle}`,
          department: inv.skuDepartment,
          expenseKey: inv.expenseAccount ? `${inv.expenseAccount.accountNumber} ${inv.expenseAccount.accountTitle}` : null,
          unitCost: Number(inv.unitCost),
        }
      }
    }

    // Helper: resolve revenue account for an order item, falling back to name lookup
    function resolveItemAccount(item: typeof orders[0]['items'][0]) {
      // Direct relation
      const acct = item.service?.revenueAccount || item.inventoryItem?.revenueAccount
      if (acct) return `${acct.accountNumber} ${acct.accountTitle}`
      // Fallback: look up by item name in services then inventory
      const nameKey = item.name?.trim().toUpperCase()
      if (nameKey) {
        if (serviceNameToAccount[nameKey]) return serviceNameToAccount[nameKey].accountKey
        if (inventoryNameToAccount[nameKey]) return inventoryNameToAccount[nameKey].accountKey
      }
      return 'Unclassified Revenue'
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
      cashByAccount: Record<string, number>  // COA account key (bank account) → net cash received
      expenseByAccount: Record<string, number>  // COA account key → total ₱ amount (for indirect expenses from journal entries)
    }

    const monthly: Record<number, MonthData> = {}
    for (let m = 1; m <= 12; m++) {
      monthly[m] = {
        serviceRevenue: 0, productRevenue: 0, unearnedRevenue: 0,
        cogs: 0, revenueByDept: {}, revenueByAccount: {},
        revenueByBranch: {}, cogsByDept: {}, cogsByAccount: {}, cashReceived: 0,
        paymentsByMethod: {}, deductionsByMethod: {}, deductionsByType: {},
        deductionsByAccount: {}, cashByAccount: {}, expenseByAccount: {},
      }
    }

    // Tier 2.3: Sum HMO/GL portions of UNEARNED orders. These create AR on the
    // asset side via the wallet balance — without an offsetting Unearned Revenue
    // liability the BS would tilt by exactly this amount.
    let unearnedRevenueFromAR = 0
    const AR_PAYMENT_METHODS = new Set(['HMO', 'GL'])

    for (const order of orders) {
      const month = new Date(order.transactionDate).getMonth() + 1
      const net = Number(order.netAmount)
      const m = monthly[month]

      // Revenue classification
      if (order.revenueType === 'UNEARNED') {
        m.unearnedRevenue += net
        // Track the HMO/GL portion that creates AR but no recognized revenue.
        for (const p of order.payments) {
          if (AR_PAYMENT_METHODS.has(p.method)) unearnedRevenueFromAR += Number(p.amount)
        }
      } else if (order.orderType === 'SERVICE') {
        m.serviceRevenue += net
      } else {
        m.productRevenue += net
      }

      // Revenue by branch
      m.revenueByBranch[order.branch] = (m.revenueByBranch[order.branch] || 0) + net

      // Revenue by department, by COA account + COGS from product items
      for (const item of order.items) {
        const nameKey = item.name?.trim().toUpperCase() || ''
        const dept = item.service?.department || item.inventoryItem?.skuDepartment
          || serviceNameToAccount[nameKey]?.department || inventoryNameToAccount[nameKey]?.department || 'OTHER'
        const lineAmt = Number(item.lineTotal)
        m.revenueByDept[dept] = (m.revenueByDept[dept] || 0) + lineAmt

        // Group by assigned COA revenue account (skip unearned — they go to liabilities, not IS)
        if (order.revenueType !== 'UNEARNED') {
          const acctKey = resolveItemAccount(item)
          m.revenueByAccount[acctKey] = (m.revenueByAccount[acctKey] || 0) + lineAmt
        }

        // COGS: prefer direct relation, fall back to name lookup for unlinked inventory items
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

      // Route order-level discounts (PWD/SC, Custom) to their COA accounts
      const discAmt = Number(order.discountAmount)
      if (discAmt > 0) {
        let discAcctKey = ''

        // 1. PWD_SC type → always route to the PWD/SC account (7130)
        if (order.discountType === 'PWD_SC' && pwdScAccountKey) {
          discAcctKey = pwdScAccountKey
        }

        // 2. Try exact match on discountLabel → discount setting name
        if (!discAcctKey && order.discountLabel) {
          discAcctKey = discountLabelToAccount[order.discountLabel] || ''
        }

        // 3. Try partial match (label contains a setting name or vice versa)
        if (!discAcctKey && order.discountLabel) {
          const labelLower = order.discountLabel.toLowerCase()
          for (const [name, key] of Object.entries(discountLabelToAccount)) {
            if (labelLower.includes(name.toLowerCase()) || name.toLowerCase().includes(labelLower)) {
              discAcctKey = key
              break
            }
          }
        }

        // 4. Fallback: route to "Other Discounts" (7210) for any unmatched discount
        if (!discAcctKey && otherDiscountAccountKey) {
          discAcctKey = otherDiscountAccountKey
        }

        if (discAcctKey) {
          m.revenueByAccount[discAcctKey] = (m.revenueByAccount[discAcctKey] || 0) + discAmt
          m.deductionsByAccount[discAcctKey] = (m.deductionsByAccount[discAcctKey] || 0) + discAmt
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

        // Route net cash to payment mode's COA account (bank account)
        if (CASH_METHODS.has(p.method) && p.paymentModeId && modeAccountKey[p.paymentModeId]) {
          const acctKey = modeAccountKey[p.paymentModeId]
          m.cashByAccount[acctKey] = (m.cashByAccount[acctKey] || 0) + net
        }

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
                // Also track in deductionsByAccount so drill-down uses DEDUCTION path (not REVENUE item lookup)
                m.deductionsByAccount[ded.accountKey] = (m.deductionsByAccount[ded.accountKey] || 0) + dedAmt
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
    const inventoryBySourceAccount: Record<string, { accountNumber: string; accountTitle: string; accountType: string; amount: number }> = {}
    let unclassifiedAP = 0
    for (const item of inventoryItems) {
      const val = Number(item.unitCost) * item.quantity
      if (item.sourceAccountId && item.sourceAccount) {
        const key = item.sourceAccountId
        if (!inventoryBySourceAccount[key]) {
          inventoryBySourceAccount[key] = { accountNumber: item.sourceAccount.accountNumber, accountTitle: item.sourceAccount.accountTitle, accountType: item.sourceAccount.accountType, amount: 0 }
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
        // HMO = balance is AR; GL = totalGlAmount is the full receivable (balance is just remaining usable amount)
        const arAmt = w.walletType === 'GL' && w.totalGlAmount ? Number(w.totalGlAmount) : bal
        totalARBalance += arAmt
        arByType[w.walletType] = (arByType[w.walletType] || 0) + arAmt
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

    /* ── Journal entry balances by account ────────────────────── */

    const journalBalances: Record<string, { accountNumber: string; accountTitle: string; accountType: string; balance: number; entries: { date: string; description: string; referenceType: string; amount: number }[] }> = {}
    for (const line of journalLines) {
      if (!line.account) continue
      const key = `${line.account.accountNumber} ${line.account.accountTitle}`
      if (!journalBalances[key]) {
        journalBalances[key] = {
          accountNumber: line.account.accountNumber,
          accountTitle: line.account.accountTitle,
          accountType: line.account.accountType,
          balance: 0,
          entries: [],
        }
      }
      // For liability accounts: credit increases balance, debit decreases
      // For expense accounts: debit increases balance, credit decreases
      const credit = Number(line.credit) || 0
      const debit = Number(line.debit) || 0
      if (line.account.accountType === 'LIABILITY' || line.account.accountType === 'REVENUE' || line.account.accountType === 'EQUITY') {
        journalBalances[key].balance += credit - debit
      } else {
        journalBalances[key].balance += debit - credit
      }
      journalBalances[key].entries.push({
        date: line.journalEntry.entryDate.toISOString().split('T')[0],
        description: line.journalEntry.description,
        referenceType: line.journalEntry.referenceType || '',
        amount: credit > 0 ? credit : -debit,
      })
    }

    /* ── Feed journal-entry REVENUE into monthly revenueByAccount ── */
    // This ensures accounts like 7220 Other Comprehensive Income appear in the Income Statement
    const journalRevenueKeys = new Set<string>()
    for (const line of journalLines) {
      if (!line.account || line.account.accountType !== 'REVENUE') continue
      const key = `${line.account.accountNumber} ${line.account.accountTitle}`
      const month = new Date(line.journalEntry.entryDate).getMonth() + 1
      const credit = Number(line.credit) || 0
      const debit = Number(line.debit) || 0
      const amt = credit - debit // REVENUE: credit increases
      if (amt !== 0 && monthly[month]) {
        monthly[month].revenueByAccount[key] = (monthly[month].revenueByAccount[key] || 0) + amt
        journalRevenueKeys.add(key)
      }
    }

    /* ── Feed journal-entry EXPENSE into monthly expenseByAccount ── */
    for (const line of journalLines) {
      if (!line.account || line.account.accountType !== 'EXPENSE') continue
      const key = `${line.account.accountNumber} ${line.account.accountTitle}`
      const month = new Date(line.journalEntry.entryDate).getMonth() + 1
      const debit = Number(line.debit) || 0
      const credit = Number(line.credit) || 0
      const amt = debit - credit // EXPENSE: debit increases
      if (amt !== 0 && monthly[month]) {
        monthly[month].expenseByAccount[key] = (monthly[month].expenseByAccount[key] || 0) + amt
      }
    }

    /* ── Depreciation computation ─────────────────────────────── */

    const depByMonth: Record<number, number> = {}
    for (let m = 1; m <= 12; m++) depByMonth[m] = 0

    for (const asset of assets) {
      const monthlyDep = Number(asset.monthlyDepreciation)
      for (let m = 1; m <= 12; m++) {
        const monthStart = new Date(Date.UTC(year, m - 1, 1))
        const monthEnd = new Date(Date.UTC(year, m, 1))
        const depStart = new Date(asset.dateBought)
        const depEnd = new Date(asset.depreciationEndDate)
        if (depStart < monthEnd && depEnd > monthStart) {
          depByMonth[m] += monthlyDep
        }
      }
    }

    let accumulatedDep = 0
    for (const asset of assets) {
      const monthlyDep = Number(asset.monthlyDepreciation)
      const depStart = new Date(asset.dateBought)
      const depEnd = new Date(asset.depreciationEndDate)
      const yearEnd = new Date(Date.UTC(year + 1, 0, 1))
      const effectiveEnd = depEnd < yearEnd ? depEnd : yearEnd
      if (depStart >= yearEnd || effectiveEnd <= depStart) continue
      let months = (effectiveEnd.getUTCFullYear() - depStart.getUTCFullYear()) * 12
        + (effectiveEnd.getUTCMonth() - depStart.getUTCMonth())
      if (months < 0) months = 0
      accumulatedDep += monthlyDep * months
    }

    const assetsByClassification: Record<string, number> = {}
    for (const asset of assets) {
      assetsByClassification[asset.classification] = (assetsByClassification[asset.classification] || 0) + Number(asset.totalAmount)
    }

    /* ── Tier 2.2: Cash adjustments ─────────────────────────────
       The BS Cash row used to be just POS+AR receipts. To reflect a real
       balance we additionally need:
         a) Opening cash from BeginningBalance for cash-typed ASSET accounts.
         b) JE-driven cash flows: every JournalEntryLine touching an ASSET
            account whose number starts with '10' or whose title contains
            "cash"/"bank" — this captures salary/benefit/tax payments that
            credit cash.
         c) Inventory paid in cash: inventory items whose sourceAccount is an
            ASSET (i.e. paid from a cash/bank account, not a payable).
         d) Asset (PPE) cash purchases: lacking a per-asset payment account,
            treat all asset acquisitions as cash outflows; the BS routes the
            total against a default cash account so it shows up somewhere. */

    const isCashAccountKey = (acctNum: string, acctTitle: string) =>
      /^10/.test(acctNum) || /cash|bank/i.test(acctTitle)

    // a) Opening cash by account
    const openingByAccountKey: Record<string, number> = {}
    for (const ob of beginningBalances) {
      if (!ob.account) continue
      if (ob.account.accountType !== 'ASSET') continue
      if (!isCashAccountKey(ob.account.accountNumber, ob.account.accountTitle)) continue
      const key = `${ob.account.accountNumber} ${ob.account.accountTitle}`
      openingByAccountKey[key] = (openingByAccountKey[key] || 0) + Number(ob.amount)
    }

    // b) Net JE-derived cash deltas (debit − credit) per cash account
    const journalCashFlowByAccount: Record<string, number> = {}
    for (const line of journalLines) {
      if (!line.account || line.account.accountType !== 'ASSET') continue
      if (!isCashAccountKey(line.account.accountNumber, line.account.accountTitle)) continue
      const key = `${line.account.accountNumber} ${line.account.accountTitle}`
      const delta = Number(line.debit) - Number(line.credit)
      journalCashFlowByAccount[key] = (journalCashFlowByAccount[key] || 0) + delta
    }

    // c) Inventory paid in cash — value bought through ASSET-typed sourceAccount.
    //    Approximation: current on-hand value (already net of COGS via FIFO).
    const inventoryCashOutflowsByAccount: Record<string, number> = {}
    for (const item of inventoryItems) {
      if (!item.sourceAccount || item.sourceAccount.accountType !== 'ASSET') continue
      if (!isCashAccountKey(item.sourceAccount.accountNumber, item.sourceAccount.accountTitle)) continue
      const key = `${item.sourceAccount.accountNumber} ${item.sourceAccount.accountTitle}`
      const val = Number(item.unitCost) * item.quantity
      inventoryCashOutflowsByAccount[key] = (inventoryCashOutflowsByAccount[key] || 0) + val
    }

    // d) Asset cash purchases — total, applied against the first/lowest cash
    //    account number we know about (deterministic). User can later add a
    //    per-asset sourceAccountId to refine this.
    const assetCashOutflows = assets.reduce((s, a) => s + Number(a.totalAmount), 0)
    const cashAccountKeys = accounts
      .filter(a => a.accountType === 'ASSET' && isCashAccountKey(a.accountNumber, a.accountTitle))
      .map(a => `${a.accountNumber} ${a.accountTitle}`)
      .sort()
    const defaultCashAccountKey = cashAccountKeys[0] || null

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
      journalBalances: Object.values(journalBalances),
      journalRevenueKeys: Array.from(journalRevenueKeys),
      depreciation: {
        byMonth: depByMonth,
        accumulated: accumulatedDep,
        assetsByClassification,
      },
      // Tier 2.1: Beginning balances for the fiscal year (every account that
      // has one stored). Consumed by the BS to populate Owner's Equity, Retained
      // Earnings, and the opening side of Cash.
      beginningBalances: beginningBalances
        .filter(b => b.account)
        .map(b => ({
          accountNumber: b.account!.accountNumber,
          accountTitle: b.account!.accountTitle,
          accountType: b.account!.accountType,
          amount: Number(b.amount),
        })),
      // Tier 2.2: Cash balance components, see comment block above.
      cashAdjustments: {
        openingByAccount: openingByAccountKey,
        journalCashFlowByAccount,
        inventoryCashOutflowsByAccount,
        assetCashOutflows,
        defaultCashAccountKey,
      },
      // Tier 2.3: Liability mirroring HMO/GL receivables booked against
      // UNEARNED orders (revenue not yet recognized).
      unearnedRevenueFromAR,
    })
  } catch (err) {
    console.error('Reports API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
