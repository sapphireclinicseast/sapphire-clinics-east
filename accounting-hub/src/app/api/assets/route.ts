import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postAssetJournal, repostAssetJournal, reverseAssetJournal } from '@/lib/accounting/post-asset'
import { cleanLocation, sanitizeAssetUnits, summarizeAssetUnits } from '@/lib/asset-units'
import { assetName, isDepreciationOff, monthlyDepreciationOnSave } from '@/lib/asset-classification'

// Front-desk staff can add/edit assets (photos, renaming) but not delete them.
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const DELETE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const ASSET_BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD' }

// Auto control number: BRANCH-YEAR-000x, sequence per (branch, purchase year).
async function nextControlNumber(branch: string, dateBought: string | Date): Promise<string> {
  const code = ASSET_BRANCH_CODE[branch] || branch
  const year = new Date(dateBought).getFullYear()
  const prefix = `${code}-${year}-`
  // Every asset carrying the prefix, whatever its branch now: an asset moved to
  // another branch keeps its number (PLS5 Test, AHEA-2026-0035 → Greenhills,
  // 1 Nov), and a branch-only lookup handed that number out again.
  const existing = await prisma.asset.findMany({ where: { controlNumber: { startsWith: prefix } }, select: { controlNumber: true } })
  let max = 0
  for (const e of existing) { const m = e.controlNumber?.match(/-(\d+)$/); if (m) max = Math.max(max, parseInt(m[1], 10)) }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

function getBranchForRole(role: string): string | null {
  if (role === 'AHEA_FRONTDESK' || role === 'AHEA_ADMIN') return 'SANDBOX_EAST'
  if (role === 'AHGH_FRONTDESK' || role === 'AHGH_ADMIN') return 'SANDBOX_GREENHILLS'
  if (role === 'VERDANA_ADMIN') return 'VERDANA_STORE'
  return null
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const userRole = session.user.role as string

  // Branch-restricted roles always see their own branch
  const forcedBranch = getBranchForRole(userRole)
  const branchFilter = forcedBranch ?? searchParams.get('branch') ?? ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (branchFilter) where.branch = branchFilter

  const assets = await prisma.asset.findMany({
    where,
    include: {
      supplier: { select: { id: true, supplierName: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const serialized = assets.map((a) => ({
    ...a,
    purchasePrice: Number(a.purchasePrice),
    totalAmount: Number(a.totalAmount),
    monthlyDepreciation: Number(a.monthlyDepreciation),
  }))

  return NextResponse.json(serialized)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const {
      branch,
      name,
      purchasePrice,
      quantity,
      totalAmount,
      dateBought,
      classification,
      yearsDepreciation,
      monthlyDepreciation,
      depreciationEndDate,
      supplierId,
      sourceAccountId,
      photoUrl,
      photoUrls,
      isDefective, auditable,
      departments,
      utilized,
      accountableName,
      location,
      units,
      remarks,
    } = body

    // Multi-pc asset: per-piece custodians; the stored accountableName becomes
    // the summary so the register/audit/CSV keep reading one line per asset.
    const unitRows = sanitizeAssetUnits(units, Number(quantity) || 1)
    const custodian = unitRows
      ? summarizeAssetUnits(unitRows, typeof accountableName === 'string' ? accountableName : null)
      : accountableName || null

    const controlNumber = await nextControlNumber(branch, dateBought)
    const asset = await prisma.asset.create({
      data: {
        branch,
        name: typeof name === 'string' ? assetName(name) : name,
        purchasePrice,
        quantity: quantity ?? 1,
        totalAmount,
        dateBought: new Date(dateBought),
        classification,
        yearsDepreciation,
        monthlyDepreciation,
        depreciationEndDate: new Date(depreciationEndDate),
        supplierId: supplierId || null,
        sourceAccountId: sourceAccountId || null,
        photoUrl: photoUrl || null,
        photoUrls: Array.isArray(photoUrls) ? photoUrls : undefined,
        isDefective: !!isDefective,
        auditable: auditable !== false,
        departments: departments ?? [],
        utilized: utilized ?? true,
        controlNumber,
        accountableName: custodian,
        location: cleanLocation(location),
        units: unitRows ?? Prisma.DbNull,
        remarks: remarks || null,
        createdById: session.user.id,
      },
      include: {
        supplier: { select: { id: true, supplierName: true } },
        createdBy: { select: { id: true, name: true } },
      },
    })

    // Tier 3 Step 6: Auto-post the asset acquisition (DR PPE / CR Cash).
    try {
      const r = await postAssetJournal(prisma, asset.id, session.user.id)
      if (r.posted) {
        console.log(`[GL] Posted asset purchase JE ${r.journalEntryId} for asset ${asset.id}`)
      } else if (process.env.ENABLE_GL_POSTING === 'true') {
        console.warn(`[GL] Skipped asset purchase posting for ${asset.id}: ${r.reason}`)
      }
    } catch (postErr) {
      console.error(`[GL] Asset purchase posting threw for ${asset.id}:`, postErr)
    }

    return NextResponse.json({
      ...asset,
      purchasePrice: Number(asset.purchasePrice),
      totalAmount: Number(asset.totalAmount),
      monthlyDepreciation: Number(asset.monthlyDepreciation),
    })
  } catch (err) {
    console.error('[POST /api/assets]', err)
    return NextResponse.json({ error: 'Failed to create asset' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    const body = await req.json()
    const {
      branch,
      name,
      purchasePrice,
      quantity,
      totalAmount,
      dateBought,
      classification,
      yearsDepreciation,
      monthlyDepreciation,
      depreciationEndDate,
      supplierId,
      sourceAccountId,
      photoUrl,
      photoUrls,
      isDefective, auditable,
      departments,
      utilized,
      accountableName,
      location,
      units,
      remarks,
    } = body

    const unitRows = sanitizeAssetUnits(units, Number(quantity) || 1)
    const custodian = unitRows
      ? summarizeAssetUnits(unitRows, typeof accountableName === 'string' ? accountableName : null)
      : accountableName || null

    // Capture pre-edit state to detect material changes affecting the JE.
    const prior = await prisma.asset.findUnique({
      where: { id },
      select: { totalAmount: true, classification: true, dateBought: true, branch: true, sourceAccountId: true, yearsDepreciation: true, monthlyDepreciation: true },
    })
    // Not in the books yet: saving neither depreciates it nor posts a purchase.
    const stayOff = !!prior && isDepreciationOff(prior) && body.depreciationOff !== false

    const asset = await prisma.asset.update({
      where: { id },
      data: {
        branch,
        name: typeof name === 'string' ? assetName(name) : name,
        purchasePrice,
        quantity: quantity ?? 1,
        totalAmount,
        dateBought: new Date(dateBought),
        classification,
        yearsDepreciation,
        monthlyDepreciation: monthlyDepreciationOnSave(prior, { classification, totalAmount, yearsDepreciation, monthlyDepreciation }, body.depreciationOff),
        depreciationEndDate: new Date(depreciationEndDate),
        supplierId: supplierId || null,
        sourceAccountId: sourceAccountId || null,
        photoUrl: photoUrl || null,
        photoUrls: Array.isArray(photoUrls) ? photoUrls : undefined,
        isDefective: !!isDefective,
        auditable: auditable !== false,
        departments: departments ?? [],
        utilized: utilized ?? true,
        accountableName: custodian,
        // Only when the form sent it — other callers of this PUT keep the room.
        ...(location !== undefined ? { location: cleanLocation(location) } : {}),
        // Quantity back down to 1 clears the per-piece list — stale custody rows
        // must not outlive the pieces they described.
        units: unitRows ?? Prisma.DbNull,
        remarks: remarks || null,
      },
      include: {
        supplier: { select: { id: true, supplierName: true } },
        createdBy: { select: { id: true, name: true } },
      },
    })

    // Tier 3 Step 6: Replace the live purchase entry if any GL-affecting field
    // changed. In centavos: the form recomputes price × quantity, and float noise
    // (9794.640000000001) must not count as an edit.
    const priorCents = Math.round(Number(prior?.totalAmount) * 100)
    const newCents = Math.round(Number(asset.totalAmount) * 100)
    const materialChange = !prior
      || priorCents !== newCents
      || prior.classification !== asset.classification
      || prior.dateBought.getTime() !== asset.dateBought.getTime()
      || prior.branch !== asset.branch
      || prior.sourceAccountId !== asset.sourceAccountId
    if (materialChange && !stayOff) {
      try {
        await repostAssetJournal(prisma, id, session.user.id, 'asset edited', prior ? (newCents - priorCents) / 100 : 0)
      } catch (postErr) {
        console.error(`[GL] Asset update posting threw for ${id}:`, postErr)
      }
    }

    return NextResponse.json({
      ...asset,
      purchasePrice: Number(asset.purchasePrice),
      totalAmount: Number(asset.totalAmount),
      monthlyDepreciation: Number(asset.monthlyDepreciation),
    })
  } catch (err) {
    console.error('[PUT /api/assets]', err)
    return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !DELETE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    // Tier 3 Step 6: Reverse the GL entry BEFORE deleting the asset row so
    // referenceId lookup still works. Reversal stays as the audit trail.
    try {
      const r = await reverseAssetJournal(prisma, id, session.user.id, 'asset deleted')
      if (r.posted) console.log(`[GL] Reversed asset ${id} via JE ${r.journalEntryId}`)
    } catch (postErr) {
      console.error(`[GL] Asset reversal threw for ${id}:`, postErr)
    }

    const sourceEntryId = (await prisma.asset.findUnique({ where: { id }, select: { sourceEntryId: true } }))?.sourceEntryId
    await prisma.asset.delete({ where: { id } })
    // If this was the last asset born from a petty-cash/expense entry, release
    // the entry's "Added to Asset Management" stamp so the button reappears.
    if (sourceEntryId) {
      const remaining = await prisma.asset.count({ where: { sourceEntryId } })
      if (remaining === 0) {
        await prisma.pettyCashEntry.update({ where: { id: sourceEntryId }, data: { assetAddedAt: null } }).catch(() => {})
      }
    }
    // Balance payments that were added onto this asset are free again too.
    await prisma.pettyCashEntry.updateMany({ where: { addedToAssetId: id }, data: { addedToAssetId: null, assetAddedAt: null } }).catch(() => {})
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/assets]', err)
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 })
  }
}
