import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

// Whole-years age at a given date.
function ageYearsAt(dob: Date, at: Date): number {
  let age = at.getFullYear() - dob.getFullYear()
  const m = at.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) age--
  return age
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash', GCASH: 'GCash', PAYMAYA: 'PayMaya', PAYMONGO: 'PayMongo', DEBIT: 'Debit Card',
  CREDIT_CARD: 'Credit Card', VIP_CARD: 'VIP Card', PREPAID_CARD: 'Prepaid Card',
  REWARD_POINTS: 'Reward Points', SHOPEE: 'Shopee', LAZADA: 'Lazada',
  TIKTOK: 'TikTok', DOWNPAYMENT: 'Downpayment', PACKAGE: 'Package', ADVANCE: 'Advance',
  HMO: 'HMO', GL: 'Guarantee Letter',
}

const DEPT_LABELS: Record<string, string> = {
  PT: 'Physical Therapy', OT: 'Occupational Therapy', ST: 'Speech Therapy',
  SLP: 'Speech-Language Pathology', SPED: 'Special Education',
  PSY: 'Psychology', PSYCHOLOGY: 'Psychology', MD: 'Medical Doctor',
  CLI: 'Clinic', DIG: 'Digital & Tech', EDU: 'Training & Education',
  MER: 'Merchandise', ORTHOSIS_PROSTHESIS: 'Orthosis & Prosthesis', OTHER: 'Other',
}

const WALLET_LABELS: Record<string, string> = {
  PACKAGE: 'Package', VIP: 'VIP Card', PREPAID_CARD: 'Prepaid Card',
  DOWNPAYMENT: 'Downpayment', ADVANCE: 'Advance',
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes((session.user as { role?: string }).role || '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // EARNED only: exclude unearned-revenue orders (VIP cards, prepaid reloads, downpayments,
  // packages, advances) — those are unearned revenue, reported in the Unearned Revenue table,
  // not earned sales.
  const where: any = { status: { in: ['COMPLETED', 'REOPENED'] }, revenueType: 'EARNED' }
  if (branch && branch !== 'ALL') where.branch = branch
  if (dateFrom) where.transactionDate = { ...where.transactionDate, gte: new Date(`${dateFrom}T00:00:00+08:00`) }
  if (dateTo) where.transactionDate = { ...where.transactionDate, lte: new Date(`${dateTo}T23:59:59.999+08:00`) }

  try {
    const orders = await prisma.order.findMany({
      where,
      select: {
        subtotal: true,
        netAmount: true,
        patientId: true,
        patientName: true,
        transactionDate: true,
        items: {
          select: {
            lineTotal: true,
            service: { select: { department: true } },
            inventoryItem: { select: { skuDepartment: true } },
          },
        },
        payments: { select: { method: true, amount: true } },
      },
    })

    // Patient DOB maps from the marketing-hub Patient CRM (for age-at-order classification).
    // One bulk fetch of the full patient list; matched to orders by patientId first, then by
    // name (Patient CRM birthdate) as the user requested. Degrades gracefully if unavailable.
    const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
    const dobById = new Map<string, Date>()
    const dobByName = new Map<string, Date>()
    let ageDataAvailable = true
    try {
      const res = await fetch(`${MARKETING_HUB_URL}/api/patients/external`, {
        headers: { Authorization: `Bearer ${EXTERNAL_API_KEY}` },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = await res.json()
        for (const p of (data.patients || []) as { id?: string; firstName?: string; lastName?: string; dob?: string }[]) {
          if (!p.dob) continue
          const d = new Date(p.dob)
          if (p.id) dobById.set(p.id, d)
          const nm = normName(`${p.firstName || ''} ${p.lastName || ''}`)
          if (nm && !dobByName.has(nm)) dobByName.set(nm, d) // first match wins on rare name collisions
        }
      } else { ageDataAvailable = false }
    } catch { ageDataAvailable = false }

    let grossSales = 0, netSales = 0
    const deptGross = new Map<string, number>()
    const payAmt = new Map<string, number>()
    const accGross = { pediatric: 0, adult: 0, unknown: 0 }
    const accNet = { pediatric: 0, adult: 0, unknown: 0 }

    for (const o of orders) {
      const g = Number(o.subtotal), n = Number(o.netAmount)
      grossSales += g
      netSales += n
      // Age-at-order bucket — match by patientId first, then by patient name (Patient CRM)
      const dob = (o.patientId ? dobById.get(o.patientId) : undefined)
        || (o.patientName ? dobByName.get(normName(o.patientName)) : undefined)
      const bucket: 'pediatric' | 'adult' | 'unknown' = dob
        ? (ageYearsAt(dob, new Date(o.transactionDate)) >= 18 ? 'adult' : 'pediatric')
        : 'unknown'
      accGross[bucket] += g
      accNet[bucket] += n
      for (const it of o.items) {
        const dept = it.service?.department || it.inventoryItem?.skuDepartment || 'OTHER'
        deptGross.set(dept, (deptGross.get(dept) || 0) + Number(it.lineTotal))
      }
      for (const p of o.payments) {
        payAmt.set(p.method, (payAmt.get(p.method) || 0) + Number(p.amount))
      }
    }

    // ── Unearned revenue: current digital-wallet balances, EXCLUDING HMO & GL
    //    (those are Accounts Receivable, not unearned revenue). Branch-scoped; current snapshot.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wWhere: any = {
      isActive: true,
      balance: { gt: 0 },
      walletType: { notIn: ['HMO', 'GL'] },
    }
    if (branch && branch !== 'ALL') wWhere.branch = { in: [branch, 'ALL'] }
    const wallets = await prisma.digitalWallet.groupBy({
      by: ['walletType'],
      where: wWhere,
      _sum: { balance: true },
    })

    const round2 = (n: number) => Math.round(n * 100) / 100
    const pct = (part: number, total: number) => total > 0 ? round2((part / total) * 100) : 0

    const totalDept = [...deptGross.values()].reduce((a, b) => a + b, 0)
    const byDepartment = [...deptGross.entries()].map(([key, gross]) => ({
      key, label: DEPT_LABELS[key] || key, gross: round2(gross), pct: pct(gross, totalDept),
    })).sort((a, b) => b.gross - a.gross)

    const totalPay = [...payAmt.values()].reduce((a, b) => a + b, 0)
    const byPayment = [...payAmt.entries()].map(([method, amount]) => ({
      method, label: PAYMENT_LABELS[method] || method, amount: round2(amount), pct: pct(amount, totalPay),
    })).sort((a, b) => b.amount - a.amount)

    const unearnedRows = wallets.map(w => ({ walletType: w.walletType, amount: Number(w._sum.balance || 0) }))
    const totalUnearned = unearnedRows.reduce((a, w) => a + w.amount, 0)
    const unearnedRevenue = unearnedRows.map(w => ({
      walletType: w.walletType, label: WALLET_LABELS[w.walletType] || w.walletType,
      amount: round2(w.amount), pct: pct(w.amount, totalUnearned),
    })).sort((a, b) => b.amount - a.amount)

    // Age-at-order breakdown (Pediatric 0–17, Adult 18+, Unknown = no matched patient/DOB)
    const ageRows = (acc: { pediatric: number; adult: number; unknown: number }) => {
      const total = acc.pediatric + acc.adult + acc.unknown
      return [
        { key: 'pediatric', label: 'Pediatric (0–17)', amount: round2(acc.pediatric), pct: pct(acc.pediatric, total) },
        { key: 'adult', label: 'Adult (18+)', amount: round2(acc.adult), pct: pct(acc.adult, total) },
        { key: 'unknown', label: 'Unknown (no patient / DOB)', amount: round2(acc.unknown), pct: pct(acc.unknown, total) },
      ]
    }

    return NextResponse.json({
      summary: { grossSales: round2(grossSales), netSales: round2(netSales), orderCount: orders.length },
      byDepartment,
      byPayment,
      unearnedRevenue,
      totalUnearned: round2(totalUnearned),
      ageGross: ageRows(accGross),
      ageNet: ageRows(accNet),
      ageDataAvailable,
    })
  } catch (err) {
    console.error('Sales analysis error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
