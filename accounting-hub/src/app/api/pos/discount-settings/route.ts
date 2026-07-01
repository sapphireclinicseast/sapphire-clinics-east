import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

const VALID_WALLET_TYPES = ['PACKAGE', 'VIP', 'PREPAID_CARD', 'DOWNPAYMENT', 'ADVANCE']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch')
  const walletType = searchParams.get('walletType')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { isActive: true }
  if (branch) where.branch = branch
  if (walletType) where.walletType = walletType

  try {
    const settings = await prisma.discountSetting.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        createdBy: { select: { id: true, name: true } },
        account: { select: { id: true, accountNumber: true, accountTitle: true } },
        rules: {
          include: {
            service: { select: { id: true, name: true } },
          },
        },
      },
    })

    return NextResponse.json(settings)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { name, type, value, branch, walletType, accountId, rules } = await req.json()

    if (!name?.trim() || !type || value === undefined) {
      return NextResponse.json(
        { error: 'name, type, and value are required' },
        { status: 400 }
      )
    }

    if (!['PERCENTAGE', 'FIXED'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be PERCENTAGE or FIXED' },
        { status: 400 }
      )
    }

    if (walletType && !VALID_WALLET_TYPES.includes(walletType)) {
      return NextResponse.json(
        { error: `walletType must be one of: ${VALID_WALLET_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createData: any = {
      name: name.trim(),
      type,
      value: Number(value),
      branch: branch || null,
      walletType: walletType || null,
      accountId: accountId || null,
      createdById: session.user.id,
    }

    if (rules && Array.isArray(rules) && rules.length > 0) {
      createData.rules = {
        create: rules.map((rule: { serviceId?: string; department?: string; discountPercent: number }) => ({
          serviceId: rule.serviceId || null,
          department: rule.department || null,
          discountPercent: Number(rule.discountPercent),
        })),
      }
    }

    const setting = await prisma.discountSetting.create({
      data: createData,
      include: {
        account: { select: { id: true, accountNumber: true, accountTitle: true } },
        rules: {
          include: {
            service: { select: { id: true, name: true } },
          },
        },
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'discountSetting',
        entityId: setting.id,
        details: { name: setting.name, type, value: Number(value), branch, walletType, rulesCount: rules?.length ?? 0 },
      },
    })

    return NextResponse.json(setting, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id, name, type, value, branch, walletType, accountId, rules } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    if (type && !['PERCENTAGE', 'FIXED'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be PERCENTAGE or FIXED' },
        { status: 400 }
      )
    }

    if (walletType && !VALID_WALLET_TYPES.includes(walletType)) {
      return NextResponse.json(
        { error: `walletType must be one of: ${VALID_WALLET_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (name !== undefined) data.name = name.trim()
    if (type !== undefined) data.type = type
    if (value !== undefined) data.value = Number(value)
    if (branch !== undefined) data.branch = branch || null
    if (walletType !== undefined) data.walletType = walletType || null
    if (accountId !== undefined) data.accountId = accountId || null

    // If rules provided, delete existing and recreate
    if (rules !== undefined && Array.isArray(rules)) {
      await prisma.walletDiscountRule.deleteMany({
        where: { discountSettingId: id },
      })

      if (rules.length > 0) {
        data.rules = {
          create: rules.map((rule: { serviceId?: string; department?: string; discountPercent: number }) => ({
            serviceId: rule.serviceId || null,
            department: rule.department || null,
            discountPercent: Number(rule.discountPercent),
          })),
        }
      }
    }

    const setting = await prisma.discountSetting.update({
      where: { id },
      data,
      include: {
        account: { select: { id: true, accountNumber: true, accountTitle: true } },
        rules: {
          include: {
            service: { select: { id: true, name: true } },
          },
        },
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entity: 'discountSetting',
        entityId: setting.id,
        details: { updated: Object.keys(data), rulesReplaced: rules !== undefined },
      },
    })

    return NextResponse.json(setting)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const setting = await prisma.discountSetting.update({
      where: { id },
      data: { isActive: false },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'SOFT_DELETE',
        entity: 'discountSetting',
        entityId: setting.id,
        details: { name: setting.name },
      },
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
