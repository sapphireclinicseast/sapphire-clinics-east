import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncStoreOrders } from '@/lib/verdana-store-sync'

const STORE_ORDERS_URL = process.env.STORE_ORDERS_URL || 'https://verdanarehab.com/api/orders'
const SYNC_SECRET = process.env.STORE_SYNC_SECRET || process.env.WEIGHT_SYNC_SECRET || ''
const SYNC_EVERY_MS = 10 * 60 * 1000
let lastSync = 0

// The POS "Online Orders" widget reads the store through here rather than from
// the browser: the store's order list carries customers' names, addresses and
// phone numbers, so it only answers requests carrying the shared secret.
// Opening the widget also records any paid web order the hub hasn't seen yet.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (Date.now() - lastSync > SYNC_EVERY_MS) {
    lastSync = Date.now()
    try { await syncStoreOrders(prisma) } catch (e) { console.error('[STORE SYNC] on-view sync failed:', e) }
  }

  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get('limit')) || 20, 1), 200)
  try {
    const res = await fetch(`${STORE_ORDERS_URL}?limit=${limit}`, {
      headers: SYNC_SECRET ? { 'x-sync-secret': SYNC_SECRET } : {}, cache: 'no-store', signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return NextResponse.json({ orders: [], error: `store returned ${res.status}` }, { status: 502 })
    const json = await res.json()
    const orders = (Array.isArray(json?.orders) ? json.orders : []) as { id: string }[]
    // Which POS order each web order became, so staff can see it was booked.
    const booked = await prisma.order.findMany({
      where: { referenceNumber: { in: orders.map(o => o.id) }, branch: 'VERDANA_STORE', status: { not: 'VOIDED' } },
      select: { referenceNumber: true, orderNumber: true },
    })
    const byRef = new Map(booked.map(b => [b.referenceNumber, b.orderNumber]))
    return NextResponse.json({ orders: orders.map(o => ({ ...o, hubOrderNumber: byRef.get(o.id) ?? null })) })
  } catch (e) {
    return NextResponse.json({ orders: [], error: e instanceof Error ? e.message : 'store unreachable' }, { status: 502 })
  }
}

// Delivery-status updates from the widget, forwarded with the shared secret.
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!body?.orderId || !body?.deliveryStatus) return NextResponse.json({ error: 'orderId and deliveryStatus required' }, { status: 400 })
  const res = await fetch(STORE_ORDERS_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(SYNC_SECRET ? { 'x-sync-secret': SYNC_SECRET } : {}) },
    body: JSON.stringify({ orderId: body.orderId, deliveryStatus: body.deliveryStatus }),
    signal: AbortSignal.timeout(15_000),
  })
  const json = await res.json().catch(() => ({}))
  return NextResponse.json(json, { status: res.status })
}
