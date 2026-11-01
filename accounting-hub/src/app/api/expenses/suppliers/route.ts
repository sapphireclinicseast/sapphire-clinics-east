import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { netOfVat } from '@/lib/vat'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
const BRANCH_LABEL: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERDANA' }

interface Sup { id: string | null; registeredName: string; registeredAddress: string; tin: string; branch: string; branchLabel: string; firstAppeared: string | null; validity: string }

// GET /api/expenses/suppliers?branch=&from=&to=&all=1
// Merged view: suppliers derived from entries + manually stored suppliers.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const branch = sp.get('branch') || ''
  // branch=ALL → one supplier list across every branch and the CEO fund, for the
  // Registered Name picker in petty cash and expenses (Hannah, 2026-11-01: a
  // supplier used by one branch must be pickable everywhere, TIN and address
  // filled in). Newest details win; a saved supplier's details win over entries.
  if (branch === 'ALL') {
    const rows = await prisma.pettyCashEntry.findMany({
      where: { registeredName: { not: null } },
      select: { registeredName: true, registeredAddress: true, tinNumber: true, branch: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
    })
    const out = new Map<string, { registeredName: string; registeredAddress: string; tin: string; branches: Set<string> }>()
    for (const e of rows) {
      const name = (e.registeredName || '').trim()
      if (!name) continue
      const key = name.toLowerCase()
      const cur = out.get(key) || { registeredName: name, registeredAddress: '', tin: '', branches: new Set<string>() }
      if (e.registeredAddress?.trim()) cur.registeredAddress = e.registeredAddress.trim()
      if (e.tinNumber?.trim()) cur.tin = e.tinNumber.trim()
      cur.branches.add(BRANCH_LABEL[e.branch] || e.branch)
      out.set(key, cur)
    }
    for (const sv of await prisma.expenseSupplier.findMany()) {
      const key = sv.registeredName.trim().toLowerCase()
      const cur = out.get(key) || { registeredName: sv.registeredName.trim(), registeredAddress: '', tin: '', branches: new Set<string>() }
      if (sv.registeredAddress) cur.registeredAddress = sv.registeredAddress
      if (sv.tin) cur.tin = sv.tin
      cur.branches.add(BRANCH_LABEL[sv.branch] || sv.branch)
      out.set(key, cur)
    }
    return NextResponse.json({
      suppliers: [...out.values()]
        .map(v => ({ registeredName: v.registeredName.toUpperCase(), registeredAddress: v.registeredAddress.toUpperCase(), tin: v.tin, branches: [...v.branches] }))
        .sort((x, y) => x.registeredName.localeCompare(y.registeredName)),
    })
  }
  if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })

  // ?transactions=<registeredName> → the expense entries recorded against that supplier.
  const txnName = sp.get('transactions')
  if (txnName != null) {
    const tx = await prisma.pettyCashEntry.findMany({
      where: { branch, registeredName: { equals: txnName, mode: 'insensitive' } },
      select: { date: true, description: true, validity: true, grossAmount: true, vatable: true, vatPortion: true, pcvNumber: true },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json({
      transactions: tx.map(e => {
        const gross = Number(e.grossAmount)
        const netVat = netOfVat(e)
        return {
          date: e.date ? e.date.toISOString().slice(0, 10) : null,
          pcvNumber: e.pcvNumber || '',
          description: e.description || '',
          validity: e.validity || '',
          gross, vat: gross - netVat, netVat,
        }
      }),
    })
  }

  const from = sp.get('from'), to = sp.get('to'), all = sp.get('all') === '1'

  const entries = await prisma.pettyCashEntry.findMany({
    where: { branch, registeredName: { not: null } },
    select: { registeredName: true, registeredAddress: true, tinNumber: true, date: true, validity: true },
  })
  // Per-supplier validity: 'Valid' if they have ANY valid transaction (both → Valid),
  // 'Invalid' only if every transaction is Invalid.
  const validAny = new Map<string, boolean>()
  const anyTxn = new Set<string>()
  const map = new Map<string, Sup & { _fa: Date | null }>()
  for (const e of entries) {
    const name = (e.registeredName || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    anyTxn.add(key)
    if (e.validity !== 'Invalid') validAny.set(key, true)
    const d = e.date ? new Date(e.date) : null
    const cur = map.get(key)
    if (!cur) {
      map.set(key, { id: null, registeredName: name, registeredAddress: e.registeredAddress || '', tin: e.tinNumber || '', branch, branchLabel: BRANCH_LABEL[branch], firstAppeared: null, validity: 'Valid', _fa: d })
    } else {
      if (d && (!cur._fa || d < cur._fa)) cur._fa = d
      if (!cur.registeredAddress && e.registeredAddress) cur.registeredAddress = e.registeredAddress
      if (!cur.tin && e.tinNumber) cur.tin = e.tinNumber
    }
  }
  const stored = await prisma.expenseSupplier.findMany({ where: { branch } })
  for (const s of stored) {
    const key = s.registeredName.trim().toLowerCase()
    const cur = map.get(key)
    if (!cur) map.set(key, { id: s.id, registeredName: s.registeredName, registeredAddress: s.registeredAddress || '', tin: s.tin || '', branch, branchLabel: BRANCH_LABEL[branch], firstAppeared: null, validity: 'Valid', _fa: null })
    else { cur.id = s.id; if (s.registeredAddress) cur.registeredAddress = s.registeredAddress; if (s.tin) cur.tin = s.tin }
  }
  // Suppliers entered in Asset Management for this branch's assets (Hannah,
  // 2026-11-01: a supplier typed there must show here too). Their TIN, when
  // known, sits in the supplier's notes as "TIN …".
  const assetSuppliers = await prisma.asset.findMany({
    where: { branch: branch as never, supplierId: { not: null } },
    select: { dateBought: true, supplier: { select: { supplierName: true, address: true, notes: true } } },
  })
  for (const a of assetSuppliers) {
    const sup = a.supplier
    if (!sup?.supplierName?.trim()) continue
    const key = sup.supplierName.trim().toLowerCase()
    const tin = sup.notes?.match(/TIN\s*([0-9][0-9-]{8,})/i)?.[1] || ''
    const cur = map.get(key)
    if (!cur) map.set(key, { id: null, registeredName: sup.supplierName.trim(), registeredAddress: sup.address || '', tin, branch, branchLabel: BRANCH_LABEL[branch], firstAppeared: null, validity: 'Valid', _fa: a.dateBought })
    else {
      if (!cur.registeredAddress && sup.address) cur.registeredAddress = sup.address
      if (!cur.tin && tin) cur.tin = tin
      if (!cur._fa || a.dateBought < cur._fa) cur._fa = a.dateBought
    }
  }
  // Finalize validity: Invalid only when they have transactions and none are Valid.
  for (const [key, sup] of map) sup.validity = (anyTxn.has(key) && !validAny.get(key)) ? 'Invalid' : 'Valid'

  // Names and addresses read in capitals everywhere.
  let list = [...map.values()].map(x => ({ ...x, registeredName: x.registeredName.toUpperCase(), registeredAddress: x.registeredAddress.toUpperCase(), firstAppeared: x._fa ? x._fa.toISOString().slice(0, 10) : null }))
  if (!all && (from || to)) {
    const f = from ? new Date(from) : null
    let t: Date | null = null
    if (to) { t = new Date(to); t.setUTCDate(t.getUTCDate() + 1) }
    list = list.filter(x => {
      if (!x._fa) return false
      if (f && x._fa < f) return false
      if (t && x._fa >= t) return false
      return true
    })
  }
  // strip internal _fa field before returning
  return NextResponse.json({ suppliers: list.map(({ _fa, ...rest }) => { void _fa; return rest }) })
}

// POST /api/expenses/suppliers  { branch, registeredName, registeredAddress?, tin? }
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, registeredName, registeredAddress, tin } = await req.json()
    if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    const name = String(registeredName || '').trim().toUpperCase()
    if (!name) return NextResponse.json({ error: 'Registered Name is required' }, { status: 400 })
    const supplier = await prisma.expenseSupplier.upsert({
      where: { branch_registeredName: { branch, registeredName: name } },
      update: { registeredAddress: registeredAddress ? String(registeredAddress).trim().toUpperCase() : null, tin: tin ? String(tin) : null },
      create: { branch, registeredName: name, registeredAddress: registeredAddress ? String(registeredAddress).trim().toUpperCase() : null, tin: tin ? String(tin) : null },
    })
    return NextResponse.json(supplier)
  } catch (e) {
    console.error('Supplier create error:', e)
    return NextResponse.json({ error: 'Failed to add supplier' }, { status: 500 })
  }
}

// PUT /api/expenses/suppliers — edit an existing saved supplier's details.
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { id, registeredName, registeredAddress, tin } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const name = String(registeredName || '').trim().toUpperCase()
    if (!name) return NextResponse.json({ error: 'Registered Name is required' }, { status: 400 })
    const updated = await prisma.expenseSupplier.update({
      where: { id },
      data: { registeredName: name, registeredAddress: registeredAddress ? String(registeredAddress).trim().toUpperCase() : null, tin: tin ? String(tin) : null },
    })
    return NextResponse.json(updated)
  } catch (e) {
    // Unique (branch, registeredName) collision when renaming to an existing supplier.
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'A supplier with this Registered Name already exists for this branch.' }, { status: 409 })
    }
    console.error('Supplier update error:', e)
    return NextResponse.json({ error: 'Failed to update supplier' }, { status: 500 })
  }
}

// DELETE /api/expenses/suppliers?id=...
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await prisma.expenseSupplier.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
