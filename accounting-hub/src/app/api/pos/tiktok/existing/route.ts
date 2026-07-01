import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET ?ids=orderId1,orderId2[&from=YYYY-MM-DD&to=YYYY-MM-DD]
//   existing         — order IDs already imported as Tiktok orders (dedupe)
//   legacyCandidates — active Verdana PRODUCT orders NOT tagged Tiktok (e.g. CASH),
//                      matched either by reference (ids) or within the date window,
//                      each with net + date + item IDs so the client can match on
//                      reference OR (net + items + date ±3 days).
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const ids = (sp.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean)
  const from = sp.get('from'), to = sp.get('to')
  if (ids.length === 0 && !(from && to)) return NextResponse.json({ existing: [], legacyCandidates: [] })

  const existRows = ids.length ? await prisma.order.findMany({
    where: { platform: 'Tiktok', referenceNumber: { in: ids } },
    select: { referenceNumber: true },
  }) : []

  // Date window widened ±3 days for the fallback match.
  const range: { gte?: Date; lte?: Date } = {}
  if (from) { const d = new Date(from); d.setUTCDate(d.getUTCDate() - 3); range.gte = d }
  if (to) { const d = new Date(to); d.setUTCDate(d.getUTCDate() + 4); range.lte = d }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orClauses: any[] = []
  if (ids.length) orClauses.push({ referenceNumber: { in: ids } })
  if (from && to) orClauses.push({ transactionDate: range })

  const candidates = orClauses.length ? await prisma.order.findMany({
    where: {
      orderType: 'PRODUCT', branch: 'VERDANA_STORE', status: 'COMPLETED',
      // "not Tiktok" must INCLUDE platform=null (e.g. legacy CASH orders). A bare
      // NOT/{not:'Tiktok'} filter drops NULL rows in SQL (NULL != 'Tiktok' is not TRUE),
      // which silently skipped every null-platform legacy order and risked double-counting.
      AND: [
        { OR: [{ platform: null }, { NOT: { platform: 'Tiktok' } }] },
        { OR: orClauses },
      ],
    },
    select: { id: true, referenceNumber: true, netAmount: true, transactionDate: true, items: { select: { inventoryItemId: true, name: true } } },
  }) : []

  const norm = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim()
  return NextResponse.json({
    existing: existRows.map(o => o.referenceNumber).filter(Boolean),
    legacyCandidates: candidates.map(o => ({
      id: o.id, referenceNumber: o.referenceNumber, netAmount: Number(o.netAmount),
      ymd: o.transactionDate.toISOString().slice(0, 10),
      itemIds: [...new Set(o.items.map(i => i.inventoryItemId).filter(Boolean))].sort(),
      itemNames: [...new Set(o.items.map(i => norm(i.name)))].sort(),
    })),
  })
}
