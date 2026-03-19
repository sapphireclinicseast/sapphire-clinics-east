import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

function generateBarcode(): string {
  const digits = Math.floor(100000 + Math.random() * 900000).toString()
  return `SCEI-W-${digits}`
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const params = parsePagination(searchParams)
  const search = searchParams.get('search') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { isActive: true }

  if (search) {
    where.OR = [
      { patientName: { contains: search, mode: 'insensitive' } },
      { barcode: { contains: search, mode: 'insensitive' } },
      { patientEmail: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [wallets, total] = await Promise.all([
    prisma.digitalWallet.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        _count: { select: { packages: true } },
      },
    }),
    prisma.digitalWallet.count({ where }),
  ])

  return NextResponse.json(paginatedResult(wallets, total, params))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { patientId, patientName, patientEmail } = await req.json()

    if (!patientName?.trim()) {
      return NextResponse.json({ error: 'Patient name is required' }, { status: 400 })
    }

    // Generate unique barcode with retry
    let barcode = generateBarcode()
    let attempts = 0
    while (attempts < 10) {
      const existing = await prisma.digitalWallet.findUnique({ where: { barcode } })
      if (!existing) break
      barcode = generateBarcode()
      attempts++
    }

    const wallet = await prisma.digitalWallet.create({
      data: {
        barcode,
        patientId: patientId?.trim() || null,
        patientName: patientName.trim(),
        patientEmail: patientEmail?.trim() || null,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'digitalWallet',
        entityId: wallet.id,
        details: { patientName: wallet.patientName, barcode: wallet.barcode },
      },
    })

    return NextResponse.json(wallet, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
