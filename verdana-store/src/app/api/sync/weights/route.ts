import { NextResponse } from 'next/server'
import { readStoreData, writeStoreData } from '@/lib/store-data'

/**
 * Shipping weights pushed from the accounting hub, keyed by SKU.
 *
 * Deliberately NOT under /api/admin: that gate is a human password for the
 * dashboard, and a server-to-server caller should not be holding it. This has
 * its own secret and refuses outright when none is configured, so it can never
 * sit open by accident.
 *
 * Weight decides what a customer pays for delivery (settings.ts prices by
 * Σ weightKg × qty), so values are range-checked rather than trusted.
 */

const MAX_KG = 1000

export async function POST(req: Request) {
  const secret = process.env.WEIGHT_SYNC_SECRET || ''
  if (!secret) {
    return NextResponse.json({ error: 'Weight sync is not configured on this server' }, { status: 503 })
  }
  if (req.headers.get('x-sync-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { weights?: { sku?: string; weightKg?: number | null }[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const incoming = Array.isArray(body.weights) ? body.weights : []
  if (incoming.length === 0) {
    return NextResponse.json({ error: 'Send { weights: [{ sku, weightKg }] }' }, { status: 400 })
  }

  const wanted = new Map<string, number | undefined>()
  const rejected: string[] = []
  for (const row of incoming) {
    const sku = String(row?.sku || '').trim().toUpperCase()
    if (!sku) continue
    if (row.weightKg === null || row.weightKg === undefined) {
      wanted.set(sku, undefined)   // clearing the weight is legitimate
      continue
    }
    const kg = Number(row.weightKg)
    if (!Number.isFinite(kg) || kg <= 0 || kg > MAX_KG) {
      rejected.push(`${sku} (${row.weightKg})`)
      continue
    }
    wanted.set(sku, kg)
  }
  if (wanted.size === 0) {
    return NextResponse.json({ error: 'No usable rows', rejected }, { status: 400 })
  }

  const data = await readStoreData()
  const updated: string[] = []
  const unchanged: string[] = []
  for (const product of data.products) {
    const sku = String(product.sku || '').trim().toUpperCase()
    if (!sku || !wanted.has(sku)) continue
    const next = wanted.get(sku)
    if (product.weightKg === next) { unchanged.push(sku); continue }
    product.weightKg = next
    updated.push(sku)
  }

  // Only rewrite the file when something actually moved.
  if (updated.length > 0) await writeStoreData(data)

  const matched = new Set([...updated, ...unchanged])
  const unmatched = [...wanted.keys()].filter((s) => !matched.has(s))

  return NextResponse.json({ ok: true, updated: updated.length, unchanged: unchanged.length, unmatched, rejected })
}
