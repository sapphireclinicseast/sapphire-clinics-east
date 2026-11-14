// GET /api/internal/store-prices
//
// The price every SKU sells for (Inventory selling price = the POS price), so
// verdanarehab.com can follow the hub. Hannah 11/14: website prices must match
// the backend. A cron on the VPS (/usr/local/bin/verdana-price-sync.sh) reads
// this every 15 minutes and updates the store's product file by SKU.
//
// Auth: x-internal-secret = NEXTAUTH_SECRET — the same server-local pattern as
// the PayMongo sync cron. Read-only; nothing here writes.
//
// Returns { generatedAt, prices: [{ sku, price }] } — products and variants.
// A variant without its own price sells at the product's price, so it is
// listed with that price.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET || ''
  if (!secret || req.headers.get('x-internal-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const items = await prisma.inventoryItem.findMany({
    where: { isActive: true, sourceItemId: null },
    select: {
      sku: true, sellingPrice: true,
      variants: { where: { isActive: true }, select: { variantSku: true, sellingPrice: true } },
    },
  })

  const prices: { sku: string; price: number }[] = []
  for (const it of items) {
    const base = it.sellingPrice == null ? null : Number(it.sellingPrice)
    if (base != null && base > 0) prices.push({ sku: it.sku, price: base })
    for (const v of it.variants) {
      const p = v.sellingPrice == null ? base : Number(v.sellingPrice)
      if (p != null && p > 0) prices.push({ sku: v.variantSku, price: p })
    }
  }

  return NextResponse.json({ generatedAt: new Date().toISOString(), prices })
}
