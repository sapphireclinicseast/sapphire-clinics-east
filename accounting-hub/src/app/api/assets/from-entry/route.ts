import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { assetClassFromAccountTitle, ASSET_CLASSIFICATION_LABELS, ENTRY_DEPT_TO_ASSET, isDepreciatingClassification } from '@/lib/asset-classification'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const ASSET_BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD' }
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']

async function nextControlNumber(branch: string, dateBought: Date): Promise<string> {
  const code = ASSET_BRANCH_CODE[branch] || branch
  const prefix = `${code}-${dateBought.getFullYear()}-`
  const existing = await prisma.asset.findMany({ where: { branch: branch as never, controlNumber: { startsWith: prefix } }, select: { controlNumber: true } })
  let max = 0
  for (const e of existing) { const m = e.controlNumber?.match(/-(\d+)$/); if (m) max = Math.max(max, parseInt(m[1], 10)) }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

// POST { entryId }  → create Asset Management record(s) pre-filled from a
// petty-cash / one-time-expense entry whose accountTitle is a PPE classification.
// A multi-branch (CEO) allocation creates one asset per branch, each priced at
// that branch's allocated amount. No acquisition JE is posted — the source entry
// already carries the GL/cash impact, so posting one here would double-count.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { entryId } = await req.json()
    if (!entryId) return NextResponse.json({ error: 'entryId is required' }, { status: 400 })
    const e = await prisma.pettyCashEntry.findUnique({ where: { id: entryId } })
    if (!e) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

    const classification = assetClassFromAccountTitle(e.accountTitle)
    if (!classification) return NextResponse.json({ error: 'This entry is not an asset classification' }, { status: 400 })

    // Price basis: net of VAT (assets are booked ex-VAT; VAT is Input VAT).
    const vatFactor = e.vatable === 'VAT' ? 1 / 1.12 : 1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allocs = (Array.isArray(e.branchAllocations) ? e.branchAllocations : []) as { branch?: string; amount?: number | string }[]
    const nonZero = allocs.filter(a => a?.branch && Number(a.amount) !== 0)

    // Build the list of (branch, price) targets. Multi/CEO allocation → one per
    // branch at its allocated amount; otherwise a single asset at the full net.
    const targets: { branch: string; price: number }[] = []
    if (nonZero.length >= 1) {
      for (const a of nonZero) targets.push({ branch: a.branch!, price: Number(a.amount) * vatFactor })
    } else {
      targets.push({ branch: e.branch, price: Number(e.grossAmount) * vatFactor })
    }
    for (const t of targets) {
      if (!VALID_BRANCHES.includes(t.branch)) {
        return NextResponse.json({ error: `CEO / unallocated entries need a branch allocation before they can become assets (got "${t.branch}").` }, { status: 400 })
      }
    }

    // Intangibles / other non-current assets are NOT depreciated.
    const depreciates = isDepreciatingClassification(classification)
    const depRow = depreciates ? await prisma.assetDepreciationSetting.findUnique({ where: { classification } }) : null
    const years = depreciates ? (depRow?.years ?? 5) : 0
    const name = (e.description || '').trim() || ASSET_CLASSIFICATION_LABELS[classification]
    const dateBought = e.date ? new Date(e.date) : new Date()
    const depEnd = new Date(dateBought); if (years > 0) depEnd.setFullYear(depEnd.getFullYear() + years)
    const deptName = e.department ? ENTRY_DEPT_TO_ASSET[e.department] : undefined
    const departments = deptName ? [deptName] : []

    // Best-effort supplier link by name (no auto-create).
    let supplierId: string | null = null
    if (e.registeredName?.trim()) {
      const sup = await prisma.supplier.findFirst({ where: { supplierName: { equals: e.registeredName.trim(), mode: 'insensitive' } }, select: { id: true } })
      supplierId = sup?.id ?? null
    }

    const created: { id: string; branch: string; name: string; controlNumber: string | null; totalAmount: number }[] = []
    for (const t of targets) {
      const total = Math.round(t.price * 100) / 100
      const monthly = years > 0 ? total / (years * 12) : 0
      const controlNumber = await nextControlNumber(t.branch, dateBought)
      const asset = await prisma.asset.create({
        data: {
          branch: t.branch as never,
          name,
          purchasePrice: total,
          quantity: 1,
          totalAmount: total,
          dateBought,
          classification,
          yearsDepreciation: years,
          monthlyDepreciation: monthly,
          depreciationEndDate: depEnd,
          supplierId,
          departments,
          controlNumber,
          fromPettyCash: true,   // cash handled by petty-cash replenishment — no bank credit on the BS
          remarks: `Auto-created from petty cash / expense ${e.pcvNumber}`,
          createdById: session.user.id as string,
        },
        select: { id: true, branch: true, name: true, controlNumber: true, totalAmount: true },
      })
      created.push({ ...asset, totalAmount: Number(asset.totalAmount) })
    }

    // Stamp the source entry so the "Added to Asset Management" state persists for
    // all users (server-side, survives refresh / sign-out / cache clear).
    const assetAddedAt = new Date()
    await prisma.pettyCashEntry.update({ where: { id: e.id }, data: { assetAddedAt } })

    return NextResponse.json({ created, assetAddedAt })
  } catch (err) {
    console.error('Asset from-entry error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create asset' }, { status: 500 })
  }
}
