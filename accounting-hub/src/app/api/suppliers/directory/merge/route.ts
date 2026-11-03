import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { supplierKey } from '@/lib/supplier-directory'

// Merge suppliers on the Suppliers page (Hannah, 2026-11-03): tick the rows
// that are one supplier written several ways ("BDO" / "BDO UNIBANK INC.") and
// keep one name. Everything under the other names moves to it.
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/**
 * POST /api/suppliers/directory/merge { keys: string[], keepKey: string, name?: string }
 * - expense entries under any of the names take the kept name
 * - each branch's saved Expenses supplier rows fold into one (TIN/address kept)
 * - supplier records fold into one: assets, inventory items and supplier
 *   requests move to it, and details it lacks are copied from the others
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json().catch(() => null) as { keys?: string[]; keepKey?: string; name?: string } | null
  const keys = [...new Set((Array.isArray(body?.keys) ? body!.keys : []).map(k => supplierKey(String(k))).filter(Boolean))]
  const keepKey = supplierKey(String(body?.keepKey || ''))
  if (keys.length < 2 || !keys.includes(keepKey)) return NextResponse.json({ error: 'Tick at least two suppliers and choose the one to keep' }, { status: 400 })
  const others = keys.filter(k => k !== keepKey)

  const [masters, expenseRows] = await Promise.all([
    prisma.supplier.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] }),
    prisma.expenseSupplier.findMany(),
  ])
  const inMerge = (name: string) => keys.includes(supplierKey(name))
  const mergeMasters = masters.filter(m => inMerge(m.supplierName))
  const primary = mergeMasters.find(m => supplierKey(m.supplierName) === keepKey) || mergeMasters[0] || null

  // The kept name: typed in, else the kept supplier's record, else how it is written on its entries / Expenses list.
  let name = clean(body?.name).toUpperCase()
  if (!name) name = mergeMasters.find(m => supplierKey(m.supplierName) === keepKey)?.supplierName.trim().toUpperCase()
    || expenseRows.find(x => supplierKey(x.registeredName) === keepKey)?.registeredName.trim().toUpperCase() || ''
  if (!name) {
    const e = await prisma.$queryRaw<{ n: string }[]>`SELECT trim("registeredName") AS n FROM "PettyCashEntry"
      WHERE regexp_replace(upper(coalesce("registeredName", '')), '[^A-Z0-9]', '', 'g') = ${keepKey} LIMIT 1`
    name = (e[0]?.n || '').toUpperCase()
  }
  if (!supplierKey(name)) return NextResponse.json({ error: 'Could not tell which name to keep' }, { status: 400 })
  const nameKey = supplierKey(name)
  // Typing a name that belongs to a supplier outside this merge would silently join it — refuse.
  if (!keys.includes(nameKey) && (masters.some(m => supplierKey(m.supplierName) === nameKey) || expenseRows.some(x => supplierKey(x.registeredName) === nameKey))) {
    return NextResponse.json({ error: `"${name}" is already another supplier on the list — tick it too to merge it in` }, { status: 409 })
  }

  try {
    const result = await prisma.$transaction(async tx => {
      // 1. Expense entries under any of the names
      const entries = await tx.$executeRaw`UPDATE "PettyCashEntry" SET "registeredName" = ${name}, "updatedAt" = now()
        WHERE regexp_replace(upper(coalesce("registeredName", '')), '[^A-Z0-9]', '', 'g') = ANY(${keys})
          AND "registeredName" IS DISTINCT FROM ${name}`

      // 2. Each branch's saved Expenses supplier: one row per branch, under the kept name
      let expenseFolded = 0
      const byBranch = new Map<string, typeof expenseRows>()
      for (const x of expenseRows.filter(x => inMerge(x.registeredName))) byBranch.set(x.branch, [...(byBranch.get(x.branch) || []), x])
      for (const rows of byBranch.values()) {
        const keep = rows.find(x => supplierKey(x.registeredName) === keepKey) || rows[0]
        const tin = keep.tin || rows.find(x => x.tin)?.tin || null
        const registeredAddress = keep.registeredAddress || rows.find(x => x.registeredAddress)?.registeredAddress || null
        const drop = rows.filter(x => x.id !== keep.id)
        if (drop.length) await tx.expenseSupplier.deleteMany({ where: { id: { in: drop.map(x => x.id) } } })
        await tx.expenseSupplier.update({ where: { id: keep.id }, data: { registeredName: name, tin, registeredAddress } })
        expenseFolded += drop.length
      }

      // 3. Supplier records: one, holding every link and every detail
      let mastersFolded = 0, assetsMoved = 0, itemsMoved = 0
      if (primary) {
        const rest = mergeMasters.filter(m => m.id !== primary.id)
        const pick = <K extends keyof typeof primary>(k: K) => primary[k] ?? rest.find(m => m[k] != null && m[k] !== '')?.[k] ?? null
        for (const m of rest) {
          assetsMoved += (await tx.asset.updateMany({ where: { supplierId: m.id }, data: { supplierId: primary.id } })).count
          itemsMoved += (await tx.inventoryItem.updateMany({ where: { supplierId: m.id }, data: { supplierId: primary.id } })).count
          await tx.supplierRequest.updateMany({ where: { supplierId: m.id }, data: { supplierId: primary.id } })
        }
        const notes = [primary.notes, ...rest.filter(m => m.notes && !(primary.notes || '').includes(m.notes)).map(m => `Merged from ${m.supplierName}: ${m.notes}`)]
          .filter(Boolean).join(' · ') || null
        await tx.supplier.update({
          where: { id: primary.id },
          data: {
            supplierName: name, isActive: true, notes,
            email: pick('email'), contactNumber: pick('contactNumber'), contactPerson: pick('contactPerson'), contactMethod: pick('contactMethod'),
            contactHandle: pick('contactHandle'), address: pick('address'), tin: pick('tin'), itemsProvided: pick('itemsProvided'),
            isForeign: primary.isForeign || rest.some(m => m.isForeign),
            currency: primary.isForeign ? primary.currency : (rest.find(m => m.isForeign)?.currency || primary.currency),
            defaultExchangeRate: pick('defaultExchangeRate'),
          },
        })
        if (rest.length) await tx.supplier.deleteMany({ where: { id: { in: rest.map(m => m.id) } } })
        mastersFolded = rest.length
      }
      await tx.auditLog.create({
        data: {
          userId: session.user.id!, action: 'MERGE', entity: 'supplier', entityId: primary?.id || nameKey,
          details: { kept: name, merged: others, entries, expenseFolded, mastersFolded, assetsMoved, itemsMoved },
        },
      })
      return { entries, expenseFolded, mastersFolded, assetsMoved, itemsMoved }
    })
    return NextResponse.json({ ok: true, name, ...result })
  } catch (e) {
    console.error('Supplier merge error:', e)
    return NextResponse.json({ error: 'Merge failed — nothing was changed' }, { status: 500 })
  }
}
