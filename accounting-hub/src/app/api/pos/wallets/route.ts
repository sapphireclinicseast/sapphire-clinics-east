import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

const TYPE_PREFIX: Record<string, string> = {
  PACKAGE: 'P',
  VIP: 'V',
  PREPAID_CARD: 'R',
  DOWNPAYMENT: 'D',
  ADVANCE: 'A',
  HMO: 'H',
  GL: 'G',
}

function generateBarcode(walletType: string): string {
  const prefix = TYPE_PREFIX[walletType] || 'W'
  const digits = Math.floor(100000 + Math.random() * 900000).toString()
  return `SCEI-${prefix}-${digits}`
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const params = parsePagination(searchParams)
  const search = searchParams.get('search') || ''
  const patientId = searchParams.get('patientId') || ''
  const walletType = searchParams.get('walletType') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { isActive: true }

  if (walletType) {
    where.walletType = walletType
  }

  if (patientId) {
    where.patientId = patientId
  }

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
    const { patientId, patientName, patientEmail, walletType } = await req.json()

    if (!patientName?.trim()) {
      return NextResponse.json({ error: 'Patient name is required' }, { status: 400 })
    }

    if (!walletType || !TYPE_PREFIX[walletType]) {
      return NextResponse.json(
        { error: 'Valid walletType is required (PACKAGE, VIP, PREPAID_CARD, DOWNPAYMENT, ADVANCE)' },
        { status: 400 }
      )
    }

    // Check for existing wallet with same patientId + walletType
    if (patientId?.trim()) {
      const existingWallet = await prisma.digitalWallet.findFirst({
        where: {
          patientId: patientId.trim(),
          walletType,
          isActive: true,
        },
        include: {
          _count: { select: { packages: true } },
        },
      })

      if (existingWallet) {
        return NextResponse.json({
          ...existingWallet,
          existingWallet: true,
        })
      }
    }

    // Generate unique barcode (only for VIP and PREPAID_CARD — others use internal ID)
    const CARD_TYPES = ['VIP', 'PREPAID_CARD']
    let barcode: string
    if (CARD_TYPES.includes(walletType)) {
      barcode = generateBarcode(walletType)
      let attempts = 0
      while (attempts < 10) {
        const existing = await prisma.digitalWallet.findUnique({ where: { barcode } })
        if (!existing) break
        barcode = generateBarcode(walletType)
        attempts++
      }
    } else {
      // Non-card wallets get a simple internal reference (no printed barcode)
      const prefix = TYPE_PREFIX[walletType] || 'W'
      barcode = `SCEI-${prefix}-${Date.now().toString(36).toUpperCase()}`
    }

    const wallet = await prisma.digitalWallet.create({
      data: {
        barcode,
        walletType,
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
        details: { patientName: wallet.patientName, barcode: wallet.barcode, walletType: wallet.walletType },
      },
    })

    return NextResponse.json(wallet, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
