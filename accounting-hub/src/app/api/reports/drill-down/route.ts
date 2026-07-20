import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { WalletType } from '@prisma/client'
import { productSubtypeLabel } from '@/lib/sku-taxonomy'

// HMO / GL payments make an order's revenue a receivable (mirrors the income statement).
const AR_PAYMENT_METHODS = new Set(['HMO', 'GL'])

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

const CASH_METHODS = ['CASH', 'GCASH', 'PAYMAYA', 'PAYMONGO', 'DEBIT', 'CREDIT_CARD', 'SHOPEE', 'LAZADA', 'TIKTOK']

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash', GCASH: 'GCash', PAYMAYA: 'PayMaya', PAYMONGO: 'PayMongo', DEBIT: 'Debit Card',
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
  SBEA: 'East Branch', SBGH: 'Greenhills Branch', VERDANA_STORE: 'Verdana Store',
  SANDBOX_EAST: 'East Branch', SANDBOX_GREENHILLS: 'Greenhills Branch',
}

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December']

function formatCutoffLabel(period: string): string {
  // period format: "2026-05-2" (year-month-cutoffNum) or "2026-05-1"
  const parts = period.split('-')
  if (parts.length < 3) return period
  const monthName = MONTH_NAMES[parseInt(parts[1], 10) - 1] || parts[1]
  const cutoffLabel = parts[2] === '1' ? 'First Cutoff' : 'Second Cutoff'
  return `${monthName} ${parts[0]} ${cutoffLabel}`
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
  const subtype = searchParams.get('subtype') || ''  // product sub-classification, e.g. "Occupational Therapy · Toys"
  const portion = searchParams.get('portion') || ''  // 'CASH' | 'RECEIVABLE' for the cash/receivables split

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
    // ── Accounts Receivable balance breakdown, per HMO/GL wallet (patient) ──
    // accountKey carries the wallet type ('HMO' or 'GL'). HMO AR = wallet balance;
    // GL AR = totalGlAmount (the full approved amount). Matches the balance sheet total.
    if (category === 'AR_BALANCE') {
      const arType = (accountKey || 'HMO').toUpperCase()
      const wt = arType === 'GL' ? WalletType.GL : WalletType.HMO
      const wallets = await prisma.digitalWallet.findMany({
        where: { isActive: true, walletType: wt },
        select: { patientName: true, balance: true, totalGlAmount: true, agency: true, branch: true, dateObtained: true },
        orderBy: { patientName: 'asc' },
      })
      const items = wallets.map(w => {
        const amount = wt === WalletType.GL && w.totalGlAmount ? Number(w.totalGlAmount) : Number(w.balance)
        return {
          date: w.dateObtained ? w.dateObtained.toISOString().split('T')[0] : '',
          type: `${w.patientName}${w.agency ? ` · ${w.agency}` : ''}`,
          branch: BRANCH_LABELS[w.branch] || w.branch,
          amount,
        }
      }).filter(i => Math.abs(i.amount) > 0.005).sort((a, b) => b.amount - a.amount)
      return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
    }

    // ── Depreciation expense detail (per-asset, per-month rows) ──
    if (category === 'DEPRECIATION_EXPENSE') {
      const assets = await prisma.asset.findMany({
        where: branch !== 'ALL' ? { branch: orderBranch as 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' | 'VERDANA_STORE' | 'AURA_INSTITUTE' } : {},
        select: { name: true, classification: true, branch: true, totalAmount: true, monthlyDepreciation: true, dateBought: true, depreciationEndDate: true },
        orderBy: { dateBought: 'asc' },
      })
      const CLASSIFICATION_LABELS: Record<string, string> = {
        '2020': 'Buildings', '2030': 'Clinic Appliances', '2040': 'Educational Toys, Books & Others',
        '2050': 'Furniture and Fixtures', '2060': 'Office Equipment & Electronic Devices',
        '2070': 'PPE and Lease Improvements', '2080': 'Therapy Equipment',
        '2090': 'Treatment and Assessment Tools', '2100': 'Vehicles',
      }
      const DEP_BRANCH_LABELS = { SANDBOX_EAST: 'East Branch', SANDBOX_GREENHILLS: 'Greenhills Branch', VERDANA_STORE: 'Verdana Store' }
      const items: { date: string; type: string; branch: string; amount: number }[] = []
      for (const asset of assets) {
        const monthlyDep = Number(asset.monthlyDepreciation)
        for (let d = new Date(startDate); d < endDate; d.setUTCMonth(d.getUTCMonth() + 1)) {
          const monthStart = new Date(d)
          const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
          const depStart = new Date(asset.dateBought)
          const depEnd = new Date(asset.depreciationEndDate)
          if (depStart < monthEnd && depEnd > monthStart) {
            items.push({
              date: monthStart.toISOString().split('T')[0],
              type: `${asset.name} — ${CLASSIFICATION_LABELS[asset.classification] || asset.classification}`,
              branch: DEP_BRANCH_LABELS[asset.branch as keyof typeof DEP_BRANCH_LABELS] || asset.branch,
              amount: monthlyDep,
            })
          }
        }
      }
      return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
    }

    // ── Accumulated depreciation detail (per-asset total through period end) ──
    if (category === 'ACCUMULATED_DEPRECIATION') {
      const assets = await prisma.asset.findMany({
        where: branch !== 'ALL' ? { branch: orderBranch as 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' | 'VERDANA_STORE' | 'AURA_INSTITUTE' } : {},
        select: { name: true, classification: true, branch: true, totalAmount: true, monthlyDepreciation: true, dateBought: true, depreciationEndDate: true },
        orderBy: { dateBought: 'asc' },
      })
      const CLASSIFICATION_LABELS: Record<string, string> = {
        '2020': 'Buildings', '2030': 'Clinic Appliances', '2040': 'Educational Toys, Books & Others',
        '2050': 'Furniture and Fixtures', '2060': 'Office Equipment & Electronic Devices',
        '2070': 'PPE and Lease Improvements', '2080': 'Therapy Equipment',
        '2090': 'Treatment and Assessment Tools', '2100': 'Vehicles',
      }
      const DEP_BRANCH_LABELS = { SANDBOX_EAST: 'East Branch', SANDBOX_GREENHILLS: 'Greenhills Branch', VERDANA_STORE: 'Verdana Store' }
      const items: { date: string; type: string; branch: string; amount: number }[] = []
      for (const asset of assets) {
        const monthlyDep = Number(asset.monthlyDepreciation)
        const depStart = new Date(asset.dateBought)
        const depEnd = new Date(asset.depreciationEndDate)
        const effectiveEnd = depEnd < endDate ? depEnd : endDate
        if (depStart >= endDate || effectiveEnd <= depStart) continue
        let months = (effectiveEnd.getUTCFullYear() - depStart.getUTCFullYear()) * 12
          + (effectiveEnd.getUTCMonth() - depStart.getUTCMonth())
        if (months < 0) months = 0
        const accumulated = monthlyDep * months
        if (accumulated <= 0) continue
        items.push({
          date: depStart.toISOString().split('T')[0],
          type: `${asset.name} — ${CLASSIFICATION_LABELS[asset.classification] || asset.classification} · ₱${monthlyDep.toFixed(2)}/mo × ${months} months`,
          branch: DEP_BRANCH_LABELS[asset.branch as keyof typeof DEP_BRANCH_LABELS] || asset.branch,
          amount: accumulated,
        })
      }
      return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
    }

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
        date: formatCutoffLabel(e.cutoffPeriod),
        type: `${e.consultant?.name || '—'}${e.consultant?.department ? ` · ${DEPT_LABELS[e.consultant.department] || e.consultant.department}` : ''}`,
        branch: BRANCH_LABELS[e.branch] || e.branch,
        amount: Number(e.grossPay),
      }))
      return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
    }

    // ── Employee salary expense detail (8232 Salaries — per-employee payslip rows) ──
    if (category === 'EMPLOYEE_PAYROLL_EXPENSE_DETAIL') {
      const cutoffPrefix = month > 0
        ? `${year}-${String(month).padStart(2, '0')}`
        : String(year)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {
        status: { in: ['FINAL', 'LOCKED'] },
        cutoffPeriod: { startsWith: cutoffPrefix },
      }
      if (branch !== 'ALL') where.branch = branch

      const payslips = await prisma.employeePayslip.findMany({
        where,
        include: { employee: { select: { firstName: true, lastName: true, department: true } } },
        orderBy: [{ cutoffPeriod: 'asc' }, { branch: 'asc' }],
      })

      const items = payslips.map(p => ({
        date: formatCutoffLabel(p.cutoffPeriod),
        type: `${p.employee.firstName} ${p.employee.lastName}${p.employee.department ? ` · ${DEPT_LABELS[p.employee.department] || p.employee.department}` : ''}`,
        branch: BRANCH_LABELS[p.branch] || p.branch,
        amount: Number(p.grossPay),
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

      // For payroll entries, entryDate is when payroll was finalized (may be a later month),
      // so we filter by cutoff period (referenceId) instead of entryDate.
      // Non-payroll entries continue to be filtered by entryDate as usual.
      const cutoffPrefix = (month >= 1 && month <= 12)
        ? `${year}-${String(month).padStart(2, '0')}-`
        : `${year}-`

      const lines = await prisma.journalEntryLine.findMany({
        where: {
          account: { accountNumber: acctNum, accountTitle: acctTitle },
          OR: [
            // Non-payroll entries: filter by entry date range
            {
              journalEntry: {
                entryDate: { gte: startDate, lt: endDate },
                referenceType: { notIn: ['PAYROLL_EMPLOYEE', 'PAYROLL_CONSULTANT'] },
                ...(branch !== 'ALL' ? { branch } : {}),
              },
            },
            // Payroll entries: filter by cutoff period, not by entry date
            {
              journalEntry: {
                referenceType: { in: ['PAYROLL_EMPLOYEE', 'PAYROLL_CONSULTANT'] },
                referenceId: { startsWith: cutoffPrefix },
                ...(branch !== 'ALL' ? { branch } : {}),
              },
            },
          ],
        },
        select: {
          debit: true,
          credit: true,
          description: true,
          account: { select: { accountType: true } },
          journalEntry: { select: { entryDate: true, description: true, referenceType: true, referenceId: true } },
        },
        orderBy: { journalEntry: { entryDate: 'asc' } },
      })

      const items = lines.map(line => {
        const credit = Number(line.credit) || 0
        const debit = Number(line.debit) || 0
        const isLiability = line.account?.accountType === 'LIABILITY' || line.account?.accountType === 'REVENUE' || line.account?.accountType === 'EQUITY'
        const amount = isLiability ? (credit - debit) : (debit - credit)

        // For payroll entries, show the cutoff period end date rather than the processing date
        let displayDate = line.journalEntry.entryDate.toISOString().split('T')[0]
        if (
          (line.journalEntry.referenceType === 'PAYROLL_EMPLOYEE' || line.journalEntry.referenceType === 'PAYROLL_CONSULTANT') &&
          line.journalEntry.referenceId
        ) {
          const cutoffStr = line.journalEntry.referenceId.split('|')[0] // e.g. '2026-04-2'
          const cutoffParts = cutoffStr.split('-')
          if (cutoffParts.length >= 3) {
            const cy = parseInt(cutoffParts[0], 10)
            const cm = parseInt(cutoffParts[1], 10)
            const cn = parseInt(cutoffParts[2], 10) // 1 = first half, 2 = second half
            if (!isNaN(cy) && !isNaN(cm)) {
              const mm = String(cm).padStart(2, '0')
              if (cn === 1) {
                displayDate = `${cy}-${mm}-15` // 1st cutoff ends on the 15th
              } else {
                const lastDay = new Date(Date.UTC(cy, cm, 0)).getUTCDate()
                displayDate = `${cy}-${mm}-${String(lastDay).padStart(2, '0')}` // 2nd cutoff ends on last day
              }
            }
          }
        }

        return {
          date: displayDate,
          type: `${line.journalEntry.description}${line.description ? ` — ${line.description}` : ''}`,
          branch: line.journalEntry.referenceType || '—',
          amount,
        }
      })

      // Also include petty cash entries classified to this expense account (net of VAT).
      const pcRows = await prisma.pettyCashEntry.findMany({
        where: {
          accountTitle: accountKey,
          date: { gte: startDate, lt: endDate },
          recordType: { not: 'RECURRING' },   // recurring = setups, not actual expenses
          ...(branch !== 'ALL' ? { branch: orderBranch } : { branch: { not: 'CEO' } }),
        },
        orderBy: { date: 'asc' },
      })
      for (const e of pcRows) {
        if (e.pcfStatus === 'Cancelled' || e.validity === 'Cancelled' || e.vatable === 'Cancelled') continue
        const gross = Number(e.grossAmount)
        const net = e.vatable === 'VAT' ? gross / 1.12 : gross
        if (!net) continue
        items.push({
          date: e.date ? e.date.toISOString().split('T')[0] : '',
          type: `${e.pcvNumber} — ${e.description || ''} · Petty Cash`,
          branch: 'PETTY CASH',
          amount: net,
        })
      }
      // Distributed (prepaid) recurring entries classified here amortize monthly — the
      // IS shows net/n per month, so surface each amortized month that falls in range.
      const distRows = await prisma.pettyCashEntry.findMany({
        where: {
          accountTitle: accountKey, recordType: 'RECURRING', distributeMonthly: true,
          distributeStart: { not: null }, distributeEnd: { not: null },
          ...(branch !== 'ALL' ? { branch: orderBranch } : { branch: { not: 'CEO' } }),
        },
      })
      for (const e of distRows) {
        if (e.pcfStatus === 'Cancelled' || e.validity === 'Cancelled' || e.vatable === 'Cancelled') continue
        if (!e.distributeStart || !e.distributeEnd) continue
        const gross = Number(e.grossAmount)
        const net = e.vatable === 'VAT' ? gross / 1.12 : gross
        if (!net) continue
        const sd = new Date(e.distributeStart), ed = new Date(e.distributeEnd)
        const sIdx = sd.getUTCFullYear() * 12 + sd.getUTCMonth()
        const eIdx = ed.getUTCFullYear() * 12 + ed.getUTCMonth()
        const count = eIdx - sIdx + 1
        if (count <= 0) continue
        const monthlyNet = net / count
        for (let idx = sIdx; idx <= eIdx; idx++) {
          const y = Math.floor(idx / 12), m0 = idx % 12
          const mDate = new Date(Date.UTC(y, m0, 1))
          if (mDate >= startDate && mDate < endDate) {
            items.push({
              date: `${y}-${String(m0 + 1).padStart(2, '0')}-01`,
              type: `${e.pcvNumber} — ${e.description || ''} · Prepaid amortization (${count}-mo)`,
              branch: 'PETTY CASH',
              amount: Math.round(monthlyNet * 100) / 100,
            })
          }
        }
      }

      // CEO petty cash allocated to this expense account for the filtered branch
      const ceoRows = await prisma.pettyCashEntry.findMany({
        where: {
          accountTitle: accountKey, branch: 'CEO',
          date: { gte: startDate, lt: endDate },
        },
        orderBy: { date: 'asc' },
      })
      for (const e of ceoRows) {
        if (e.pcfStatus === 'Cancelled' || e.validity === 'Cancelled' || e.vatable === 'Cancelled') continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allocs = Array.isArray(e.branchAllocations) ? (e.branchAllocations as any[]) : []
        for (const a of allocs) {
          const ab = a?.branch as string | undefined
          const ag = Number(a?.amount) || 0
          if (!ab || !ag) continue
          if (branch !== 'ALL' && ab !== orderBranch) continue
          const netA = e.vatable === 'VAT' ? ag / 1.12 : ag
          if (!netA) continue
          items.push({
            date: e.date ? e.date.toISOString().split('T')[0] : '',
            type: `${e.pcvNumber} — ${e.description || ''} · CEO Petty Cash`,
            branch: 'CEO',
            amount: netA,
          })
        }
      }
      items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

      return NextResponse.json({ items, total: items.reduce((s, i) => s + i.amount, 0) })
    }

    // Wallet balances drill-down (unearned revenue)
    // HMO and GL wallet types are excluded here to match `wallets.total` on the balance sheet
    // (those are tracked as Accounts Receivable, not Unearned Revenue liability).
    if (category === 'WALLET_BALANCE') {
      const AR_WALLET_TYPES: WalletType[] = [WalletType.HMO, WalletType.GL]
      const wallets = await prisma.digitalWallet.findMany({
        where: { isActive: true, balance: { gt: 0 }, walletType: { notIn: AR_WALLET_TYPES } },
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
          select: { name: true, skuDepartment: true, skuCategory: true, revenueAccount: { select: { accountNumber: true, accountTitle: true } } },
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
      const invNameMap: Record<string, { acctKey: string; dept: string; name: string; category: string | null }> = {}
      for (const i of invLookup) {
        if (i.revenueAccount) {
          invNameMap[i.name.trim().toUpperCase()] = {
            acctKey: `${i.revenueAccount.accountNumber} ${i.revenueAccount.accountTitle}`,
            dept: i.skuDepartment, name: i.name, category: i.skuCategory,
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
          payments: { select: { method: true } },
          items: {
            select: {
              name: true,
              lineTotal: true,
              quantity: true,
              service: { select: { name: true, department: true, isHmoGl: true, revenueAccount: { select: { accountNumber: true, accountTitle: true } } } },
              inventoryItem: { select: { name: true, skuDepartment: true, skuCategory: true, revenueAccount: { select: { accountNumber: true, accountTitle: true } } } },
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

          // Product sub-classification filter (7080 "Department · Category" sub-rows).
          if (subtype) {
            const catCode = item.inventoryItem?.skuCategory || invNameMap[item.name?.trim().toUpperCase() || '']?.category
            if (productSubtypeLabel(dept, catCode) !== subtype) continue
          }
          // Cash vs Receivables split: receivable when paid via HMO/GL or the service is HMO/GL.
          if (portion) {
            const isRcv = o.payments.some(p => AR_PAYMENT_METHODS.has(p.method)) || !!item.service?.isHmoGl
            if (portion === 'CASH' && isRcv) continue
            if (portion === 'RECEIVABLE' && !isRcv) continue
          }
          const name = item.service?.name || item.inventoryItem?.name || item.name || ''
          items.push({
            date: o.transactionDate.toISOString().split('T')[0],
            type: `#${o.orderNumber} — ${o.orderType === 'SERVICE' ? 'Service' : 'Product'} (${DEPT_LABELS[dept] || dept})${name ? ` · ${name}` : ''}${o.patientName ? ` · ${o.patientName}` : ''}`,
            branch: BRANCH_LABELS[o.branch] || o.branch,
            amount: Number(item.lineTotal),
          })
        }
      }

      // Also include any journal entry credits to this revenue account
      // (handles accounts fed by both POS orders and manual journal entries).
      // Skipped for subtype/portion drills — those splits only classify POS order items.
      if (!subtype && !portion) {
      const [jeAcctNum, ...jeTitleParts] = accountKey.split(' ')
      const jeAcctTitle = jeTitleParts.join(' ')
      const jeLines = await prisma.journalEntryLine.findMany({
        where: {
          account: { accountNumber: jeAcctNum, accountTitle: jeAcctTitle },
          journalEntry: {
            entryDate: { gte: startDate, lt: endDate },
            ...(branch !== 'ALL' ? { branch } : {}),
          },
        },
        select: {
          debit: true,
          credit: true,
          journalEntry: { select: { entryDate: true, description: true, branch: true } },
        },
        orderBy: { journalEntry: { entryDate: 'asc' } },
      })
      for (const line of jeLines) {
        const credit = Number(line.credit) || 0
        const debit = Number(line.debit) || 0
        const amt = credit - debit // REVENUE: credit increases
        if (amt === 0) continue
        items.push({
          date: line.journalEntry.entryDate.toISOString().split('T')[0],
          type: `JE: ${line.journalEntry.description}`,
          branch: BRANCH_LABELS[line.journalEntry.branch] || line.journalEntry.branch,
          amount: amt,
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
