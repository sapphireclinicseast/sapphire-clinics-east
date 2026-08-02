import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const ASSET_BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD' }

// Same scheme as the single-asset create: BRANCH-YEAR-000x per (branch, year).
async function nextControlNumber(branch: string, dateBought: string | Date): Promise<string> {
  const code = ASSET_BRANCH_CODE[branch] || branch
  const year = new Date(dateBought).getFullYear()
  const prefix = `${code}-${year}-`
  const existing = await prisma.asset.findMany({ where: { branch: branch as never, controlNumber: { startsWith: prefix } }, select: { controlNumber: true } })
  let max = 0
  for (const e of existing) { const m = e.controlNumber?.match(/-(\d+)$/); if (m) max = Math.max(max, parseInt(m[1], 10)) }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

// POST — create several assets from one shipment, landing freight onto each.
//
// Same method as the inventory Freight Purchase batch: goods are converted at
// the exchange rate, freight is split across the rows in proportion to the
// volume they occupy (CBM), and the resulting landed cost per unit becomes the
// asset's purchasePrice — i.e. the basis its depreciation is computed from.
// Rows without dimensions fall back to an equal share so freight is never lost.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const {
      branch, dateBought, hasForeignPurchase = true, exchangeRate,
      freight1Amount, freight1IsForeign = false,
      freight2Amount, freight2IsForeign = false,
      freight3Amount, freight3IsForeign = false,
      supplierId, sourceAccountId, remarks, rows,
    } = await req.json()

    if (!branch || !dateBought) return NextResponse.json({ error: 'Branch and purchase date are required' }, { status: 400 })
    const valid = (Array.isArray(rows) ? rows : []).filter(
      (r: { name?: string; quantity?: string | number }) => String(r.name || '').trim() && parseInt(String(r.quantity)) > 0)
    if (valid.length === 0) return NextResponse.json({ error: 'Add at least one asset row with a name and quantity' }, { status: 400 })

    const exRate = hasForeignPurchase && exchangeRate ? parseFloat(String(exchangeRate)) : 1
    const f = (v: unknown, foreign: boolean) => (parseFloat(String(v || '0')) || 0) * (foreign && hasForeignPurchase ? exRate : 1)
    const totalFreightPHP = f(freight1Amount, freight1IsForeign) + f(freight2Amount, freight2IsForeign) + f(freight3Amount, freight3IsForeign)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processed = valid.map((r: any) => {
      const qty = parseInt(String(r.quantity)) || 0
      const price = parseFloat(String(r.price || '0')) || 0
      const pricePHP = r.priceIsForeign && hasForeignPurchase ? price * exRate : price
      const l = parseFloat(String(r.dimL || '')) || 0
      const w = parseFloat(String(r.dimW || '')) || 0
      const h = parseFloat(String(r.dimH || '')) || 0
      const cbmPerUnit = l > 0 && w > 0 && h > 0 ? (l * w * h) / 1_000_000 : 0
      return { ...r, qty, pricePHP, totalCbm: cbmPerUnit * qty }
    })
    const grandCbm = processed.reduce((s: number, r: { totalCbm: number }) => s + r.totalCbm, 0)

    const created = []
    for (const row of processed) {
      const share = grandCbm > 0 ? row.totalCbm / grandCbm : 1 / processed.length
      const freightPerUnit = row.qty > 0 ? (share * totalFreightPHP) / row.qty : 0
      const landedUnit = row.pricePHP + freightPerUnit
      const years = parseInt(String(row.yearsDepreciation)) || 5
      const monthly = years > 0 ? landedUnit / (years * 12) : 0
      const bought = new Date(dateBought)
      const end = new Date(bought); end.setFullYear(end.getFullYear() + years)
      const controlNumber = await nextControlNumber(branch, bought)
      const asset = await prisma.asset.create({
        data: {
          branch, name: String(row.name).trim(),
          purchasePrice: landedUnit,
          quantity: row.qty,
          totalAmount: landedUnit * row.qty,
          dateBought: bought,
          classification: String(row.classification || '2040'),
          yearsDepreciation: years,
          monthlyDepreciation: monthly,
          depreciationEndDate: end,
          supplierId: supplierId || null,
          sourceAccountId: sourceAccountId || null,
          departments: [],
          controlNumber,
          remarks: [remarks, `Landed cost: goods ${row.pricePHP.toFixed(2)} + freight ${freightPerUnit.toFixed(2)} per unit`]
            .filter(Boolean).join(' — '),
          createdById: session.user.id,
        },
      })
      created.push({ id: asset.id, name: asset.name, controlNumber, landedUnit, freightPerUnit })
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'ASSET_FREIGHT_BATCH', entity: 'asset', entityId: created[0]?.id ?? '',
        details: { count: created.length, totalFreightPHP, exchangeRate: hasForeignPurchase ? exRate : null },
      },
    })
    return NextResponse.json({ created, totalFreightPHP }, { status: 201 })
  } catch (e) {
    console.error('[Asset freight batch] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal server error' }, { status: 500 })
  }
}
