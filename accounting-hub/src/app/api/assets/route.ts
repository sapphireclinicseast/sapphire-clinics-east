import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postAssetJournal, reverseAssetJournal } from '@/lib/accounting/post-asset'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const ASSET_BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD' }

// Auto control number: BRANCH-YEAR-000x, sequence per (branch, purchase year).
async function nextControlNumber(branch: string, dateBought: string | Date): Promise<string> {
  const code = ASSET_BRANCH_CODE[branch] || branch
  const year = new Date(dateBought).getFullYear()
  const prefix = `${code}-${year}-`
  const existing = await prisma.asset.findMany({ where: { branch: branch as never, controlNumber: { startsWith: prefix } }, select: { controlNumber: true } })
  let max = 0
  for (const e of existing) { const m = e.controlNumber?.match(/-(\d+)$/); if (m) max = Math.max(max, parseInt(m[1], 10)) }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

function getBranchForRole(role: string): string | null {
  if (role === 'SBEA_FRONTDESK' || role === 'SBEA_ADMIN') return 'SANDBOX_EAST'
  if (role === 'SBGH_FRONTDESK' || role === 'SBGH_ADMIN') return 'SANDBOX_GREENHILLS'
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
      photoUrl,
      photoUrls,
      isDefective,
      departments,
      utilized,
      accountableName,
      remarks,
    } = body

    const controlNumber = await nextControlNumber(branch, dateBought)
    const asset = await prisma.asset.create({
      data: {
        branch,
        name,
        purchasePrice,
        quantity: quantity ?? 1,
        totalAmount,
        dateBought: new Date(dateBought),
        classification,
        yearsDepreciation,
        monthlyDepreciation,
        depreciationEndDate: new Date(depreciationEndDate),
        supplierId: supplierId || null,
        photoUrl: photoUrl || null,
        photoUrls: Array.isArray(photoUrls) ? photoUrls : undefined,
        isDefective: !!isDefective,
        departments: departments ?? [],
        utilized: utilized ?? true,
        controlNumber,
        accountableName: accountableName || null,
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
      photoUrl,
      photoUrls,
      isDefective,
      departments,
      utilized,
      accountableName,
      remarks,
    } = body

    // Capture pre-edit state to detect material changes affecting the JE.
    const prior = await prisma.asset.findUnique({
      where: { id },
      select: { totalAmount: true, classification: true, dateBought: true, branch: true },
    })

    const asset = await prisma.asset.update({
      where: { id },
      data: {
        branch,
        name,
        purchasePrice,
        quantity: quantity ?? 1,
        totalAmount,
        dateBought: new Date(dateBought),
        classification,
        yearsDepreciation,
        monthlyDepreciation,
        depreciationEndDate: new Date(depreciationEndDate),
        supplierId: supplierId || null,
        photoUrl: photoUrl || null,
        photoUrls: Array.isArray(photoUrls) ? photoUrls : undefined,
        isDefective: !!isDefective,
        departments: departments ?? [],
        utilized: utilized ?? true,
        accountableName: accountableName || null,
        remarks: remarks || null,
      },
      include: {
        supplier: { select: { id: true, supplierName: true } },
        createdBy: { select: { id: true, name: true } },
      },
    })

    // Tier 3 Step 6: Reverse and re-post if any GL-affecting field changed.
    const materialChange = !prior
      || Number(prior.totalAmount) !== Number(asset.totalAmount)
      || prior.classification !== asset.classification
      || prior.dateBought.getTime() !== asset.dateBought.getTime()
      || prior.branch !== asset.branch
    if (materialChange) {
      try {
        await reverseAssetJournal(prisma, id, session.user.id, 'asset edited')
        await postAssetJournal(prisma, id, session.user.id)
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
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
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

    await prisma.asset.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/assets]', err)
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 })
  }
}
