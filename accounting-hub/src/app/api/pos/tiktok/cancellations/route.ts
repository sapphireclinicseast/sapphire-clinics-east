import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

// GET ?branch=&from=&to= → top cancellation reasons + row list, for Products Analysis.
// Informational only — TiktokCancellation carries no GL linkage.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const branch = sp.get('branch') || 'VERDANA_STORE'
  const from = sp.get('from'), to = sp.get('to')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { branch }
  if (from || to) {
    where.cancelledTime = {}
    if (from) where.cancelledTime.gte = new Date(`${from}T00:00:00.000Z`)
    if (to) where.cancelledTime.lte = new Date(`${to}T23:59:59.999Z`)
  }
  const rows = await prisma.tiktokCancellation.findMany({ where, orderBy: { cancelledTime: 'desc' } })
  const byReason = new Map<string, { reason: string; count: number; orderAmount: number }>()
  for (const r of rows) {
    const key = r.cancelReason || (r.status !== 'Canceled' ? 'Failed delivery — not yet formally cancelled' : 'Unknown')
    const cur = byReason.get(key) || { reason: key, count: 0, orderAmount: 0 }
    cur.count++
    cur.orderAmount += Number(r.orderAmount || 0)
    byReason.set(key, cur)
  }
  const topReasons = [...byReason.values()].sort((a, b) => b.count - a.count)
  return NextResponse.json({
    total: rows.length,
    topReasons,
    rows: rows.map(r => ({
      orderId: r.orderId, status: r.status, cancelType: r.cancelType, cancelBy: r.cancelBy,
      cancelReason: r.cancelReason, orderAmount: Number(r.orderAmount || 0),
      cancelledTime: r.cancelledTime, sourceFile: r.sourceFile,
    })),
  })
}

interface CancelRow {
  orderId: string; status: string; cancelType?: string | null; cancelBy?: string | null
  cancelReason?: string | null; orderAmount?: number | null; cancelledTime?: string | null
}

// POST { branch, sourceFile: 'CANCELLED'|'FAILED_DELIVERY', rows: CancelRow[] }
// Upserts by orderId. A "Cancelled" upload's real reason overwrites a prior
// "Failed Delivery" row's null reason for the same order (the two exports overlap
// heavily — TikTok auto-cancels most failed deliveries within a few days — so the
// same order commonly appears in both files; the later, richer record wins).
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, sourceFile, rows } = await req.json() as { branch?: string; sourceFile?: string; rows?: CancelRow[] }
    if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: 'No rows' }, { status: 400 })
    if (sourceFile !== 'CANCELLED' && sourceFile !== 'FAILED_DELIVERY') return NextResponse.json({ error: 'sourceFile must be CANCELLED or FAILED_DELIVERY' }, { status: 400 })

    let created = 0, updated = 0, skipped = 0
    // De-dupe within the incoming file itself (multi-SKU orders repeat the order ID).
    const byOrder = new Map<string, CancelRow>()
    for (const r of rows) { const id = String(r.orderId || '').trim(); if (id && !byOrder.has(id)) byOrder.set(id, r) }

    for (const [orderId, r] of byOrder) {
      const data = {
        branch: branch || 'VERDANA_STORE',
        status: r.status || 'Unknown',
        cancelType: r.cancelType || null,
        cancelBy: r.cancelBy || null,
        cancelReason: r.cancelReason || null,
        orderAmount: r.orderAmount != null ? r.orderAmount : null,
        cancelledTime: r.cancelledTime ? new Date(r.cancelledTime) : null,
        sourceFile,
        createdById: session.user!.id as string,
      }
      const existing = await prisma.tiktokCancellation.findUnique({ where: { orderId } })
      if (!existing) {
        await prisma.tiktokCancellation.create({ data: { orderId, ...data } })
        created++
      } else if (!existing.cancelReason && data.cancelReason) {
        // Upgrade a reason-less "Failed Delivery" row once the real reason arrives.
        await prisma.tiktokCancellation.update({ where: { orderId }, data })
        updated++
      } else {
        skipped++
      }
    }
    return NextResponse.json({ created, updated, skipped, total: byOrder.size })
  } catch (e) {
    console.error('TikTok cancellations import error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
