import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

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
      departments,
      utilized,
      controlNumber,
      remarks,
    } = body

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
        departments: departments ?? [],
        utilized: utilized ?? true,
        controlNumber: controlNumber || null,
        remarks: remarks || null,
        createdById: session.user.id,
      },
      include: {
        supplier: { select: { id: true, supplierName: true } },
        createdBy: { select: { id: true, name: true } },
      },
    })

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
      departments,
      utilized,
      controlNumber,
      remarks,
    } = body

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
        departments: departments ?? [],
        utilized: utilized ?? true,
        controlNumber: controlNumber || null,
        remarks: remarks || null,
      },
      include: {
        supplier: { select: { id: true, supplierName: true } },
        createdBy: { select: { id: true, name: true } },
      },
    })

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
    await prisma.asset.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/assets]', err)
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 })
  }
}
