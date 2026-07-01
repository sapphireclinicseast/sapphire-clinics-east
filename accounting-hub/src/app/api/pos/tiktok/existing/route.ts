import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET ?ids=orderId1,orderId2 → { existing: [orderIds already imported as Tiktok orders] }
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ids = (new URL(req.url).searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return NextResponse.json({ existing: [] })
  const orders = await prisma.order.findMany({
    where: { platform: 'Tiktok', referenceNumber: { in: ids } },
    select: { referenceNumber: true },
  })
  return NextResponse.json({ existing: orders.map(o => o.referenceNumber).filter(Boolean) })
}
