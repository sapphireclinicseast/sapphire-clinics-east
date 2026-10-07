import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Branch-scoped users only see their branch's referrers (mirrors /api/referrers).
function branchScope(role?: string): string | null {
  if (role === 'AHEA_ADMIN' || role === 'AHEA_FRONTDESK') return 'SANDBOX_EAST'
  if (role === 'AHGH_ADMIN' || role === 'AHGH_FRONTDESK') return 'SANDBOX_GREENHILLS'
  return null
}

interface SessionRow {
  id: string
  orderNumber: number
  date: Date
  branch: string
  patientName: string | null
  net: number
  paymentStatus: string | null
  // 'tag' = the order named this doctor at POS; 'link' = attributed through the
  // Referred-patients linkage (front desk didn't tag the order).
  via: 'tag' | 'link'
}

// GET ?from=&to=&branch=&rate= → ₱<rate>/session referral commission per doctor.
// A "session" is an earned (not UNEARNED), non-voided POS order attributed to
// the doctor either by the order's own Doctor Referral tag or — when the order
// wasn't tagged — by the patient's Referred-patients link (CRM id first, else
// exact name, same as the Referral Dashboard). One order = one session; an
// explicit order tag beats a patient link when they name different doctors.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const from = sp.get('from') ? new Date(`${sp.get('from')}T00:00:00+08:00`) : null
  const to = sp.get('to') ? new Date(`${sp.get('to')}T23:59:59.999+08:00`) : null
  const branch = sp.get('branch') || ''
  const rate = Math.max(0, Number(sp.get('rate')) || 100)
  if (!from || !to || isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: 'from and to are required (YYYY-MM-DD)' }, { status: 400 })
  }

  const scope = branchScope(session.user.role as string)
  const doctors = await prisma.referrer.findMany({
    where: { isActive: true, type: 'DOCTOR', ...(scope ? { OR: [{ branches: { isEmpty: true } }, { branches: { has: scope } }] } : {}) },
    select: { id: true, name: true, specialization: true, isInhouse: true },
  })
  const doctorIds = new Set(doctors.map(d => d.id))

  const referred = await prisma.referredPatient.findMany({
    where: { referrerId: { in: [...doctorIds] } },
    select: { referrerId: true, patientId: true, patientName: true },
  })
  // Patient → doctor, first link wins (same rule as the Referral Dashboard).
  const byId = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const r of referred) {
    if (r.patientId && !byId.has(r.patientId)) byId.set(r.patientId, r.referrerId)
    const k = r.patientName.trim().toLowerCase()
    if (!byName.has(k)) byName.set(k, r.referrerId)
  }

  const ids = [...byId.keys()]
  const names = Array.from(new Set(referred.map(r => r.patientName)))
  const orders = await prisma.order.findMany({
    where: {
      transactionDate: { gte: from, lte: to },
      status: { notIn: ['VOIDED'] },
      revenueType: { not: 'UNEARNED' },
      ...(branch ? { branch } : {}),
      OR: [
        { referrerId: { not: null } },
        ...(ids.length ? [{ patientId: { in: ids } }] : []),
        ...(names.length ? [{ patientName: { in: names } }] : []),
      ],
    },
    orderBy: { transactionDate: 'asc' },
    select: {
      id: true, orderNumber: true, transactionDate: true, branch: true,
      patientId: true, patientName: true, netAmount: true, paymentStatus: true, referrerId: true,
    },
  })

  const perDoctor = new Map<string, SessionRow[]>()
  for (const o of orders) {
    // Explicit POS tag first; otherwise the patient's linked doctor.
    const tagged = o.referrerId && doctorIds.has(o.referrerId) ? o.referrerId : null
    const linked = (o.patientId && byId.get(o.patientId)) || byName.get((o.patientName || '').trim().toLowerCase()) || null
    const rid = tagged || linked
    if (!rid || !doctorIds.has(rid)) continue
    const list = perDoctor.get(rid) || []
    list.push({
      id: o.id, orderNumber: o.orderNumber, date: o.transactionDate, branch: o.branch,
      patientName: o.patientName, net: Number(o.netAmount), paymentStatus: o.paymentStatus,
      via: tagged ? 'tag' : 'link',
    })
    perDoctor.set(rid, list)
  }

  const rows = doctors
    .map(d => {
      const sessions = perDoctor.get(d.id) || []
      return {
        referrerId: d.id,
        name: d.name,
        specialization: d.specialization,
        isInhouse: d.isInhouse,
        patients: new Set(sessions.map(s => (s.patientName || '').trim().toLowerCase())).size,
        sessions: sessions.length,
        commission: sessions.length * rate,
        orders: sessions,
      }
    })
    .filter(r => r.sessions > 0)
    .sort((a, b) => b.commission - a.commission || a.name.localeCompare(b.name))

  return NextResponse.json({ rate, rows })
}
