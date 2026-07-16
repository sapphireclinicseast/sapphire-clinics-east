import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Branch-scoped users only see their branch's referrers (mirrors /api/referrers).
function branchScope(role?: string): string | null {
  if (role === 'AHEA_ADMIN' || role === 'AHEA_FRONTDESK') return 'SANDBOX_EAST'
  if (role === 'AHGH_ADMIN' || role === 'AHGH_FRONTDESK') return 'SANDBOX_GREENHILLS'
  return null
}

// GET → per-referrer referral counts + total net sales (from referred patients'
// POS Orders). Powers the Referral Dashboard.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  const orders = (ids.length || names.length)
    ? await prisma.order.findMany({
        where: { status: { notIn: ['VOIDED'] }, OR: [...(ids.length ? [{ patientId: { in: ids } }] : []), ...(names.length ? [{ patientName: { in: names } }] : [])] },
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

  const agg = new Map<string, { referrerId: string; name: string; type: string | null; referrals: number; net: number }>()
  for (const r of referrers) agg.set(r.id, { referrerId: r.id, name: r.name, type: r.type, referrals: 0, net: 0 })
  for (const r of referred) { const a = agg.get(r.referrerId); if (a) a.referrals++ }
  for (const o of orders) {
    const rid = (o.patientId && byId.get(o.patientId)) || byName.get((o.patientName || '').trim().toLowerCase())
    if (rid) { const a = agg.get(rid); if (a) a.net += Number(o.netAmount) }
  }

  return NextResponse.json({ rows: Array.from(agg.values()) })
}
