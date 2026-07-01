import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET ?ids=orderId1,orderId2 → { existing: [orderIds already imported as Tiktok orders] }
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ids = (new URL(req.url).searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return NextResponse.json({ existing: [], legacy: [] })
  const orders = await prisma.order.findMany({
    where: { referenceNumber: { in: ids } },
    select: { id: true, referenceNumber: true, platform: true, status: true, netAmount: true },
  })
  // Already imported as Tiktok (dedupe); and legacy active orders under the same
  // reference tagged as something else (e.g. CASH) that should be replaced.
  const existing = orders.filter(o => o.platform === 'Tiktok').map(o => o.referenceNumber).filter(Boolean)
  const legacy = orders
    .filter(o => o.platform !== 'Tiktok' && o.status === 'COMPLETED')
    .map(o => ({ id: o.id, referenceNumber: o.referenceNumber, netAmount: Number(o.netAmount) }))
  return NextResponse.json({ existing, legacy })
}
