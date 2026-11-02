import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { netOfVat } from '@/lib/vat'
import { supplierKey, type DirectoryRow } from '@/lib/supplier-directory'

// The Suppliers page (Hannah, 2026-11-02): one list of everyone we buy from,
// merging the procurement suppliers (Supplier — contact person, number, email,
// reach-via, currency), the Expenses suppliers per branch (ExpenseSupplier —
// registered name, address, TIN) and every Registered Name used on an expense
// entry. Rows are joined on the name with spacing and punctuation ignored.
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
const BRANCH_LABEL: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERDANA', AURA_INSTITUTE: 'AHI', CEO: 'CEO' }
const CONTACT_METHODS = ['WeChat', 'WhatsApp', 'Viber', 'Facebook', 'Telegram', 'SMS', 'Call', 'Email', 'Other']

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const tinFromNotes = (notes: string | null) => notes?.match(/TIN\s*([0-9][0-9-]{8,})/i)?.[1] || ''

/**
 * GET /api/suppliers/directory → { suppliers: DirectoryRow[] }
 * GET /api/suppliers/directory?history=<key> → that supplier's expense entries,
 *   assets and inventory items, across every branch.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await buildDirectory()

  const historyKey = new URL(req.url).searchParams.get('history')
  if (historyKey != null) {
    const row = rows.find(r => r.key === historyKey)
    if (!row) return NextResponse.json({ entries: [], assets: [], inventory: [] })
    const [entries, assets, inventory] = await Promise.all([
      prisma.pettyCashEntry.findMany({
        where: { OR: row.names.map(n => ({ registeredName: { equals: n, mode: 'insensitive' as const } })) },
        select: { branch: true, date: true, pcvNumber: true, description: true, accountTitle: true, validity: true, grossAmount: true, vatable: true, vatPortion: true },
        orderBy: { date: 'desc' },
        take: 1000,
      }),
      row.masterId ? prisma.asset.findMany({
        where: { supplierId: row.masterId },
        select: { controlNumber: true, name: true, branch: true, quantity: true, totalAmount: true, dateBought: true },
        orderBy: { dateBought: 'desc' },
      }) : [],
      row.masterId ? prisma.inventoryItem.findMany({
        where: { supplierId: row.masterId },
        select: { sku: true, name: true, branch: true, quantity: true },
        orderBy: { name: 'asc' },
      }) : [],
    ])
    return NextResponse.json({
      entries: entries.map(e => {
        const gross = Number(e.grossAmount)
        return {
          branch: BRANCH_LABEL[e.branch] || e.branch, date: e.date ? e.date.toISOString().slice(0, 10) : null, pcvNumber: e.pcvNumber || '',
          description: e.description || '', accountTitle: e.accountTitle || '', validity: e.validity || '', gross, netVat: netOfVat(e),
        }
      }),
      assets: assets.map(a => ({ controlNumber: a.controlNumber || '', name: a.name, branch: BRANCH_LABEL[a.branch] || a.branch, quantity: a.quantity, total: Number(a.totalAmount), date: a.dateBought.toISOString().slice(0, 10) })),
      inventory: inventory.map(i => ({ sku: i.sku, name: i.name, branch: BRANCH_LABEL[i.branch] || i.branch, quantity: i.quantity })),
    })
  }

  return NextResponse.json({ suppliers: rows })
}

async function buildDirectory(): Promise<DirectoryRow[]> {
  const [masters, expenseSuppliers, entryGroups, entryDetails, assets, inventory] = await Promise.all([
    prisma.supplier.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] }),
    prisma.expenseSupplier.findMany(),
    prisma.pettyCashEntry.groupBy({
      by: ['registeredName', 'branch', 'accountTitle', 'validity'],
      where: { registeredName: { not: null } },
      _count: { _all: true },
      _sum: { grossAmount: true },
      _min: { date: true },
    }),
    // Newest TIN / address typed on an entry.
    prisma.pettyCashEntry.findMany({
      where: { registeredName: { not: null }, OR: [{ tinNumber: { not: null } }, { registeredAddress: { not: null } }] },
      select: { registeredName: true, tinNumber: true, registeredAddress: true },
      orderBy: { updatedAt: 'asc' },
    }),
    prisma.asset.findMany({ where: { supplierId: { not: null } }, select: { supplierId: true, name: true, branch: true, dateBought: true } }),
    prisma.inventoryItem.findMany({ where: { supplierId: { not: null } }, select: { supplierId: true, name: true, branch: true } }),
  ])

  type Acc = DirectoryRow & { _fa: Date | null; _valid: boolean; _hasTxn: boolean; _accounts: Map<string, { count: number; total: number }>; _branches: Set<string>; _names: Set<string> }
  const map = new Map<string, Acc>()
  const get = (name: string): Acc => {
    const key = supplierKey(name)
    let r = map.get(key)
    if (!r) {
      r = {
        key, name: name.trim().toUpperCase(), names: [], masterId: null, isActive: true, expenseIds: [], branches: [],
        tin: '', address: '', contactPerson: '', contactNumber: '', email: '', contactMethod: '', contactHandle: '',
        isForeign: false, currency: 'PHP', defaultExchangeRate: null, notes: '', itemsProvided: '',
        provided: { accounts: [], assets: [], assetCount: 0, inventory: [], inventoryCount: 0 },
        entryCount: 0, firstAppeared: null, validity: 'Valid',
        _fa: null, _valid: false, _hasTxn: false, _accounts: new Map(), _branches: new Set(), _names: new Set(),
      }
      map.set(key, r)
    }
    r._names.add(name.trim())
    return r
  }
  const seen = (r: Acc, d: Date | null) => { if (d && (!r._fa || d < r._fa)) r._fa = d }

  // Expense entries: where they were used, under which accounts, valid or not.
  for (const g of entryGroups) {
    const name = (g.registeredName || '').trim()
    if (!supplierKey(name)) continue
    const r = get(name)
    r._hasTxn = true
    if (g.validity !== 'Invalid') r._valid = true
    r._branches.add(BRANCH_LABEL[g.branch] || g.branch)
    r.entryCount += g._count._all
    seen(r, g._min.date)
    const title = (g.accountTitle || '').trim() || '(no account)'
    const a = r._accounts.get(title) || { count: 0, total: 0 }
    a.count += g._count._all
    a.total += Number(g._sum.grossAmount || 0)
    r._accounts.set(title, a)
  }
  for (const e of entryDetails) {
    const name = (e.registeredName || '').trim()
    if (!supplierKey(name)) continue
    const r = get(name)
    if (e.tinNumber?.trim()) r.tin = e.tinNumber.trim()
    if (e.registeredAddress?.trim()) r.address = e.registeredAddress.trim()
  }
  // Saved expense suppliers win over what entries carry.
  for (const s of expenseSuppliers) {
    if (!supplierKey(s.registeredName)) continue
    const r = get(s.registeredName)
    r.expenseIds.push({ id: s.id, branch: s.branch })
    r._branches.add(BRANCH_LABEL[s.branch] || s.branch)
    if (s.tin?.trim()) r.tin = s.tin.trim()
    if (s.registeredAddress?.trim()) r.address = s.registeredAddress.trim()
  }
  // The master record wins over both. Active first, so a deactivated duplicate never shadows it.
  const masterKey = new Map<string, string>() // supplier id → row key
  for (const m of masters) {
    if (!supplierKey(m.supplierName)) continue
    const r = get(m.supplierName)
    masterKey.set(m.id, r.key)
    if (r.masterId) continue
    r.masterId = m.id
    r.isActive = m.isActive
    r.name = m.supplierName.trim().toUpperCase()
    const tin = m.tin?.trim() || tinFromNotes(m.notes)
    if (tin) r.tin = tin
    if (m.address?.trim()) r.address = m.address.trim()
    r.contactPerson = m.contactPerson || ''
    r.contactNumber = m.contactNumber || ''
    r.email = m.email || ''
    r.contactMethod = m.contactMethod || ''
    r.contactHandle = m.contactHandle || ''
    r.isForeign = m.isForeign
    r.currency = m.currency || 'PHP'
    r.defaultExchangeRate = m.defaultExchangeRate != null ? Number(m.defaultExchangeRate) : null
    r.notes = m.notes || ''
    r.itemsProvided = m.itemsProvided || ''
    seen(r, m.createdAt)
  }
  for (const a of assets) {
    const r = map.get(masterKey.get(a.supplierId!) || '')
    if (!r) continue
    r.provided.assetCount++
    if (r.provided.assets.length < 8 && !r.provided.assets.includes(a.name)) r.provided.assets.push(a.name)
    r._branches.add(BRANCH_LABEL[a.branch] || a.branch)
    seen(r, a.dateBought)
  }
  for (const i of inventory) {
    const r = map.get(masterKey.get(i.supplierId!) || '')
    if (!r) continue
    r.provided.inventoryCount++
    if (r.provided.inventory.length < 8 && !r.provided.inventory.includes(i.name)) r.provided.inventory.push(i.name)
    r._branches.add(BRANCH_LABEL[i.branch] || i.branch)
  }

  return [...map.values()].map(r => {
    const { _fa, _valid, _hasTxn, _accounts, _branches, _names, ...row } = r
    return {
      ...row,
      names: [..._names],
      branches: [..._branches].sort(),
      address: row.address.toUpperCase(),
      provided: { ...row.provided, accounts: [..._accounts].map(([title, a]) => ({ title, ...a })).sort((x, y) => y.count - x.count) },
      firstAppeared: _fa ? _fa.toISOString().slice(0, 10) : null,
      // Invalid only when they have entries and none of them is valid.
      validity: _hasTxn && !_valid ? 'Invalid' as const : 'Valid' as const,
    }
  }).sort((x, y) => x.name.localeCompare(y.name))
}

type SupplierInput = {
  name?: string; tin?: string; address?: string; contactPerson?: string; contactNumber?: string; email?: string
  contactMethod?: string; contactHandle?: string; isForeign?: boolean | string; currency?: string; defaultExchangeRate?: number | string | null
  itemsProvided?: string; notes?: string
}

// Only the fields the caller sent are written; on import an empty cell leaves what is there.
function masterData(s: SupplierInput, keepBlank: boolean) {
  const data: Prisma.SupplierUncheckedUpdateInput = {}
  const put = (k: keyof SupplierInput, field: string, transform: (v: string) => string | null = v => v || null) => {
    if (s[k] === undefined) return
    const v = clean(s[k])
    if (!v && !keepBlank) return
    ;(data as Record<string, unknown>)[field] = transform(v)
  }
  put('tin', 'tin')
  put('address', 'address', v => (v ? v.toUpperCase() : null))
  put('contactPerson', 'contactPerson')
  put('contactNumber', 'contactNumber')
  put('email', 'email')
  put('contactMethod', 'contactMethod', v => CONTACT_METHODS.find(m => m.toLowerCase() === v.toLowerCase()) || (v ? 'Other' : null))
  put('contactHandle', 'contactHandle')
  put('itemsProvided', 'itemsProvided')
  put('notes', 'notes')
  if (s.isForeign !== undefined && (keepBlank || s.isForeign !== '')) {
    const foreign = typeof s.isForeign === 'boolean' ? s.isForeign : /^(y|yes|true|1|foreign)$/i.test(clean(s.isForeign))
    data.isForeign = foreign
    if (!foreign) { data.currency = 'PHP'; data.defaultExchangeRate = null }
  }
  if (s.currency !== undefined && clean(s.currency) && data.isForeign !== false) data.currency = clean(s.currency).toUpperCase().slice(0, 3)
  if (s.defaultExchangeRate !== undefined && data.isForeign !== false) {
    const rate = Number(s.defaultExchangeRate)
    if (Number.isFinite(rate) && rate > 0) data.defaultExchangeRate = rate
    else if (keepBlank) data.defaultExchangeRate = null
  }
  return data
}

/**
 * POST /api/suppliers/directory { branch?, rows: SupplierInput[] }
 * Add one supplier or import a sheet. A name already on file is updated (blank
 * cells keep what is there); a branch also lists it in that branch's Expenses suppliers.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json().catch(() => null) as { branch?: string; rows?: SupplierInput[] } | null
  const branch = VALID_BRANCHES.includes(body?.branch || '') ? body!.branch! : null
  const input = (Array.isArray(body?.rows) ? body!.rows : []).filter(r => supplierKey(clean(r?.name)))
  if (!input.length) return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })

  const masters = await prisma.supplier.findMany({ select: { id: true, supplierName: true, isActive: true }, orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] })
  const byKey = new Map<string, string>()
  for (const m of masters) if (!byKey.has(supplierKey(m.supplierName))) byKey.set(supplierKey(m.supplierName), m.id)

  let created = 0, updated = 0
  for (const r of input.slice(0, 2000)) {
    const name = clean(r.name).toUpperCase()
    const key = supplierKey(name)
    const data = masterData(r, false)
    const id = byKey.get(key)
    if (id) {
      await prisma.supplier.update({ where: { id }, data: { ...data, isActive: true } })
      updated++
    } else {
      const m = await prisma.supplier.create({
        data: { ...(data as Prisma.SupplierUncheckedCreateInput), supplierName: name, createdById: session.user.id! },
      })
      byKey.set(key, m.id)
      await prisma.auditLog.create({ data: { userId: session.user.id!, action: 'CREATE', entity: 'supplier', entityId: m.id, details: { supplierName: name, via: 'suppliers-page' } } })
      created++
    }
    if (branch) {
      const tin = clean(r.tin) || null, address = clean(r.address).toUpperCase() || null
      await prisma.expenseSupplier.upsert({
        where: { branch_registeredName: { branch, registeredName: name } },
        update: { ...(tin ? { tin } : {}), ...(address ? { registeredAddress: address } : {}) },
        create: { branch, registeredName: name, tin, registeredAddress: address },
      })
    }
  }
  return NextResponse.json({ created, updated })
}

/**
 * PUT /api/suppliers/directory { key, masterId?, ...SupplierInput, isActive? }
 * Save one supplier from the Suppliers page. The master record is created when
 * the supplier so far only lived on expense entries; TIN/address/name changes
 * are copied onto that supplier's saved Expenses rows so the pickers agree.
 */
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json().catch(() => null) as (SupplierInput & { key?: string; masterId?: string | null; isActive?: boolean }) | null
  const name = clean(body?.name).toUpperCase()
  if (!body?.key || !supplierKey(name)) return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })

  const row = (await buildDirectory()).find(r => r.key === body.key)
  if (!row) return NextResponse.json({ error: 'Supplier not found — reload the page' }, { status: 404 })
  if (supplierKey(name) !== row.key) {
    const clash = (await buildDirectory()).find(r => r.key === supplierKey(name))
    if (clash && (clash.masterId || clash.expenseIds.length)) {
      return NextResponse.json({ error: `"${clash.name}" is already on the list` }, { status: 409 })
    }
  }

  const data = { ...masterData(body, true), supplierName: name, ...(body.isActive !== undefined ? { isActive: !!body.isActive } : {}) }
  try {
    let masterId = row.masterId
    if (masterId) {
      await prisma.supplier.update({ where: { id: masterId }, data })
      await prisma.auditLog.create({ data: { userId: session.user.id!, action: 'UPDATE', entity: 'supplier', entityId: masterId, details: { updated: Object.keys(data), via: 'suppliers-page' } } })
    } else {
      const m = await prisma.supplier.create({ data: { ...(data as Prisma.SupplierUncheckedCreateInput), supplierName: name, createdById: session.user.id! } })
      masterId = m.id
      await prisma.auditLog.create({ data: { userId: session.user.id!, action: 'CREATE', entity: 'supplier', entityId: m.id, details: { supplierName: name, via: 'suppliers-page' } } })
    }
    for (const e of row.expenseIds) {
      await prisma.expenseSupplier.update({
        where: { id: e.id },
        data: {
          registeredName: name,
          ...(body.tin !== undefined ? { tin: clean(body.tin) || null } : {}),
          ...(body.address !== undefined ? { registeredAddress: clean(body.address).toUpperCase() || null } : {}),
        },
      })
    }
    return NextResponse.json({ ok: true, masterId })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Another saved supplier already has this name in one of the branches' }, { status: 409 })
    }
    console.error('Supplier directory save error:', e)
    return NextResponse.json({ error: 'Failed to save supplier' }, { status: 500 })
  }
}

/**
 * DELETE /api/suppliers/directory?key=…  Takes the supplier off the list: the
 * master record is deactivated (assets and inventory keep their link) and the
 * saved Expenses rows are removed. Expense entries are never touched.
 */
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const key = new URL(req.url).searchParams.get('key') || ''
  const row = (await buildDirectory()).find(r => r.key === key)
  if (!row) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
  if (row.masterId) {
    await prisma.supplier.update({ where: { id: row.masterId }, data: { isActive: false } })
    await prisma.auditLog.create({ data: { userId: session.user.id!, action: 'DEACTIVATE', entity: 'supplier', entityId: row.masterId } })
  }
  if (row.expenseIds.length) await prisma.expenseSupplier.deleteMany({ where: { id: { in: row.expenseIds.map(e => e.id) } } })
  return NextResponse.json({ ok: true })
}
