import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { COMMISSION_START, computeDoctorCommissions, computeMedrepNewPatients } from '@/lib/referral-commission'

// Branch-scoped users only see their branch's referrers (mirrors /api/referrers).
function branchScope(role?: string): string | null {
  if (role === 'AHEA_ADMIN' || role === 'AHEA_FRONTDESK') return 'SANDBOX_EAST'
  if (role === 'AHGH_ADMIN' || role === 'AHGH_FRONTDESK') return 'SANDBOX_GREENHILLS'
  return null
}

// GET ?from=&to=&branch= → the referral commission report:
// - per-doctor sessions × their own ₱/session rate (doctors without a rate
//   still list their sessions but earn nothing, so unticked doctors with
//   activity stay visible);
// - the medical representative's one-time incentive: new patients whose first
//   session falls in range, brought by EXTERNAL referrers.
// All computation lives in lib/referral-commission.ts — payroll uses the same
// engine (with the claim ledger), so this report and payroll always agree.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const fromStr = sp.get('from')
  const from = fromStr ? new Date(`${fromStr}T00:00:00+08:00`) : null
  const to = sp.get('to') ? new Date(`${sp.get('to')}T23:59:59.999+08:00`) : null
  const branch = sp.get('branch') || ''
  if (!from || !to || isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: 'from and to are required (YYYY-MM-DD)' }, { status: 400 })
  }
  // The engine clamps to the scheme's start; tell the UI what actually counted.
  const clamped = from < new Date(`${COMMISSION_START}T00:00:00+08:00`)
  const effectiveFrom = clamped ? COMMISSION_START : String(fromStr)

  const scope = branchScope(session.user.role as string)
  const [doctorRows, newPatients, incentive] = await Promise.all([
    computeDoctorCommissions(prisma, { from, to, branch: branch || undefined, scopeBranch: scope }),
    computeMedrepNewPatients(prisma, { from, to, branch: branch || undefined }),
    prisma.referralIncentiveSettings.findUnique({ where: { id: 'MAIN' } }),
  ])

  const rows = doctorRows
    .map(d => ({
      referrerId: d.referrerId,
      name: d.name,
      specialization: d.specialization,
      isInhouse: d.isInhouse,
      rate: d.rate,
      patients: new Set(d.sessions.map(s => s.patientKey)).size,
      sessions: d.sessions.length,
      commission: d.rate != null ? d.sessions.length * d.rate : 0,
      orders: d.sessions.map(s => ({
        id: s.orderId, orderNumber: s.orderNumber, date: s.date, branch: s.branch,
        patientName: s.patientName, net: s.net, paymentStatus: s.paymentStatus, via: s.via,
      })),
    }))
    .filter(r => r.sessions > 0)
    .sort((a, b) => b.commission - a.commission || b.sessions - a.sessions || a.name.localeCompare(b.name))

  const incentiveAmount = incentive ? Number(incentive.amount) : 50
  return NextResponse.json({
    rows,
    commissionStart: COMMISSION_START,
    effectiveFrom,
    medrep: {
      staffName: incentive?.staffName || null,
      amount: incentiveAmount,
      count: newPatients.length,
      total: newPatients.length * incentiveAmount,
      patients: newPatients,
    },
  })
}
