import { NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

const ORDERS_FILE = join(process.cwd(), 'src', 'data', 'orders.json')

async function readOrders() {
  try {
    const raw = await readFile(ORDERS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

// GET — list all orders (used by accounting system)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') // pending, preparing, shipped, delivered
  const limit = parseInt(searchParams.get('limit') || '50', 10)

  let orders = await readOrders()

  if (status) {
    orders = orders.filter((o: { deliveryStatus: string }) => o.deliveryStatus === status)
  }

  // Allow CORS for accounting subdomain
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', 'https://accounting.sapphireclinicseast.org')
  headers.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  return NextResponse.json({ orders: orders.slice(0, limit) }, { headers })
}

// PUT — update delivery status
export async function PUT(request: Request) {
  try {
    const { orderId, deliveryStatus } = await request.json()

    if (!orderId || !deliveryStatus) {
      return NextResponse.json({ error: 'orderId and deliveryStatus required' }, { status: 400 })
    }

    const orders = await readOrders()
    const index = orders.findIndex((o: { id: string }) => o.id === orderId)
    if (index === -1) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    orders[index].deliveryStatus = deliveryStatus
    await writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2))

    const headers = new Headers()
    headers.set('Access-Control-Allow-Origin', 'https://accounting.sapphireclinicseast.org')

    return NextResponse.json({ success: true, order: orders[index] }, { headers })
  } catch (error) {
    console.error('Order update error:', error)
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}

// OPTIONS — CORS preflight
export async function OPTIONS() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', 'https://accounting.sapphireclinicseast.org')
  headers.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return new NextResponse(null, { status: 200, headers })
}
