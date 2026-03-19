import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePagination, paginatedResult } from '@/lib/pagination'

const VALID_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
const VALID_BALANCES = ['DEBIT', 'CREDIT']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

const DEFAULT_BALANCE: Record<string, string> = {
  ASSET: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  REVENUE: 'CREDIT',
  EXPENSE: 'DEBIT',
}

// GET - List accounts (paginated, searchable, filterable)
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const params = parsePagination(searchParams)
  const search = searchParams.get('search') || ''
  const accountType = searchParams.get('accountType') || ''
  const subType = searchParams.get('subType') || ''
  const showInactive = searchParams.get('showInactive') === 'true'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  if (!showInactive) {
    where.isActive = true
  }

  if (search) {
    where.OR = [
      { accountNumber: { contains: search, mode: 'insensitive' } },
      { accountTitle: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (accountType && VALID_TYPES.includes(accountType)) {
    where.accountType = accountType
  }

  if (subType) {
    where.subType = subType
  }

  const [accounts, total] = await Promise.all([
    prisma.account.findMany({
      where,
      select: {
        id: true,
        accountNumber: true,
        accountTitle: true,
        accountType: true,
        subType: true,
        normalBalance: true,
        description: true,
        isActive: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
      orderBy: { accountNumber: 'asc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.account.count({ where }),
  ])

  return NextResponse.json(paginatedResult(accounts, total, params))
}

// POST - Create a new account
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { accountNumber, accountTitle, accountType, subType, normalBalance, description } = await req.json()

    if (!accountNumber?.trim() || !accountTitle?.trim() || !accountType) {
      return NextResponse.json({ error: 'Account number, title, and type are required' }, { status: 400 })
    }

    if (!VALID_TYPES.includes(accountType)) {
      return NextResponse.json({ error: 'Invalid account type' }, { status: 400 })
    }

    const balance = normalBalance && VALID_BALANCES.includes(normalBalance)
      ? normalBalance
      : DEFAULT_BALANCE[accountType]

    const existing = await prisma.account.findUnique({ where: { accountNumber: accountNumber.trim() } })
    if (existing) {
      return NextResponse.json({ error: 'Account number already exists' }, { status: 409 })
    }

    const account = await prisma.account.create({
      data: {
        accountNumber: accountNumber.trim(),
        accountTitle: accountTitle.trim(),
        accountType,
        subType: subType?.trim() || null,
        normalBalance: balance,
        description: description?.trim() || null,
        createdById: session.user.id,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'account',
        entityId: account.id,
        details: { accountNumber: account.accountNumber, accountTitle: account.accountTitle, accountType: account.accountType },
      },
    })

    return NextResponse.json(account, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update an account
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id, accountNumber, accountTitle, accountType, subType, normalBalance, description } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 })
    }

    if (accountType && !VALID_TYPES.includes(accountType)) {
      return NextResponse.json({ error: 'Invalid account type' }, { status: 400 })
    }

    if (normalBalance && !VALID_BALANCES.includes(normalBalance)) {
      return NextResponse.json({ error: 'Invalid normal balance' }, { status: 400 })
    }

    // Check uniqueness if accountNumber changes
    if (accountNumber) {
      const existing = await prisma.account.findUnique({ where: { accountNumber: accountNumber.trim() } })
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: 'Account number already exists' }, { status: 409 })
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {}
    if (accountNumber) updateData.accountNumber = accountNumber.trim()
    if (accountTitle) updateData.accountTitle = accountTitle.trim()
    if (accountType) updateData.accountType = accountType
    if (subType !== undefined) updateData.subType = subType?.trim() || null
    if (normalBalance) updateData.normalBalance = normalBalance
    if (description !== undefined) updateData.description = description?.trim() || null

    const account = await prisma.account.update({
      where: { id },
      data: updateData,
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entity: 'account',
        entityId: account.id,
        details: { updated: Object.keys(updateData) },
      },
    })

    return NextResponse.json(account)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Soft delete (default) or hard delete
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const hard = searchParams.get('hard') === 'true'

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 })
    }

    if (hard) {
      if (session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Only admins can permanently delete accounts' }, { status: 403 })
      }

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'DELETE',
          entity: 'account',
          entityId: id,
        },
      })

      await prisma.account.delete({ where: { id } })
      return NextResponse.json({ message: 'Account permanently deleted' })
    }

    // Soft delete
    await prisma.account.update({
      where: { id },
      data: { isActive: false },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DEACTIVATE',
        entity: 'account',
        entityId: id,
      },
    })

    return NextResponse.json({ message: 'Account deactivated' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
