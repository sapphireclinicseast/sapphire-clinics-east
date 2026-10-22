import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeMedrepNewPatients } from '@/lib/referral-commission'

// Branch-scoped users only see their branch's referrers (mirrors /api/referrers).
function branchScope(role?: string): string | null {
  if (role === 'AHEA_ADMIN' || role === 'AHEA_FRONTDESK') return 'SANDBOX_EAST'
  if (role === 'AHGH_ADMIN' || role === 'AHGH_FRONTDESK') return 'SANDBOX_GREENHILLS'
  return null
}

// GET → per-referrer referral counts + total net sales (from referred patients'
// POS Orders). Powers the Referral Dashboard.
// ?referrerId= instead returns the SESSIONS behind one row — attributed with
// exactly the same rules as the aggregate (patient links, first-match-wins,
// earned + non-voided), so the drill-down reconciles with the row's figures.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const detailId = new URL(req.url).searchParams.get('referrerId') || ''
  if (detailId) {
    const allReferred = await prisma.referredPatient.findMany({
      select: { referrerId: true, patientId: true, patientName: true },
    })
    const byId = new Map<string, string>()
    const byName = new Map<string, string>()
    for (const r of allReferred) {
      if (r.patientId && !byId.has(r.patientId)) byId.set(r.patientId, r.referrerId)
      const k = r.patientName.trim().toLowerCase()
      if (!byName.has(k)) byName.set(k, r.referrerId)
    }
    const mine = allReferred.filter(r => r.referrerId === detailId)
    const ids = [...new Set(mine.map(r => r.patientId).filter(Boolean))] as string[]
    const names = [...new Set(mine.map(r => r.patientName))]
    const orders = (ids.length || names.length)
      ? await prisma.order.findMany({
          where: { status: { notIn: ['VOIDED'] }, revenueType: { not: 'UNEARNED' }, OR: [...(ids.length ? [{ patientId: { in: ids } }] : []), ...(names.length ? [{ patientName: { in: names } }] : [])] },
          select: { id: true, orderNumber: true, transactionDate: true, patientId: true, patientName: true, netAmount: true, branch: true },
          orderBy: { transactionDate: 'desc' },
        })
      : []
    const sessions = orders
      .filter(o => ((o.patientId && byId.get(o.patientId)) || byName.get((o.patientName || '').trim().toLowerCase())) === detailId)
      .map(o => ({ id: o.id, orderNumber: o.orderNumber, date: o.transactionDate, patientName: o.patientName, branch: o.branch, net: Number(o.netAmount) }))
    return NextResponse.json({ sessions })
  }

  const scope = branchScope(session.user.role as string)
  const referrers = await prisma.referrer.findMany({
    where: { isActive: true, ...(scope ? { OR: [{ branches: { isEmpty: true } }, { branches: { has: scope } }] } : {}) },
    select: { id: true, name: true, type: true },
  })
  const refIds = referrers.map(r => r.id)

  const referred = await prisma.referredPatient.findMany({
    where: { referrerId: { in: refIds } },
    select: { referrerId: true, patientId: true, patientName: true },
  })

  // Match each referred patient's POS orders (by CRM id, else name) → net sales.
  const ids = Array.from(new Set(referred.map(r => r.patientId).filter(Boolean))) as string[]
  const names = Array.from(new Set(referred.map(r => r.patientName)))
  // Earned revenue only — package payments and prepaid-card reloads (UNEARNED)
  // don't count toward a referrer's net sales.
  const orders = (ids.length || names.length)
    ? await prisma.order.findMany({
        where: { status: { notIn: ['VOIDED'] }, revenueType: { not: 'UNEARNED' }, OR: [...(ids.length ? [{ patientId: { in: ids } }] : []), ...(names.length ? [{ patientName: { in: names } }] : [])] },
        select: { patientId: true, patientName: true, netAmount: true },
      })
    : []

  // Map a patient (id first, else lowercased name) → its referrer. First match wins.
  const byId = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const r of referred) {
    if (r.patientId && !byId.has(r.patientId)) byId.set(r.patientId, r.referrerId)
    const k = r.patientName.trim().toLowerCase()
    if (!byName.has(k)) byName.set(k, r.referrerId)
  }

  const agg = new Map<string, { referrerId: string; name: string; type: string | null; referrals: number; net: number; medrepTotal: number; medrepPaid: number }>()
  for (const r of referrers) agg.set(r.id, { referrerId: r.id, name: r.name, type: r.type, referrals: 0, net: 0, medrepTotal: 0, medrepPaid: 0 })
  for (const r of referred) { const a = agg.get(r.referrerId); if (a) a.referrals++ }
  for (const o of orders) {
    const rid = (o.patientId && byId.get(o.patientId)) || byName.get((o.patientName || '').trim().toLowerCase())
    if (rid) { const a = agg.get(rid); if (a) a.net += Number(o.netAmount) }
  }

  // Med-rep incentive status per referrer: every new patient they brought since
  // the scheme started, and how many of those incentives are already paid out
  // (claim-ledger MEDREP row — payslip-carried or marked by hand).
  const newPatients = await computeMedrepNewPatients(prisma, { from: new Date(0), to: new Date() })
  const claims = newPatients.length
    ? await prisma.referralCommissionItem.findMany({
        where: { kind: 'MEDREP', patientKey: { in: newPatients.map(p => p.patientKey) } },
        select: { patientKey: true },
      })
    : []
  const paidKeys = new Set(claims.map(c => c.patientKey as string))
  for (const p of newPatients) {
    const a = agg.get(p.referrerId)
    if (!a) continue
    a.medrepTotal++
    if (paidKeys.has(p.patientKey)) a.medrepPaid++
  }

  return NextResponse.json({ rows: Array.from(agg.values()) })
}
