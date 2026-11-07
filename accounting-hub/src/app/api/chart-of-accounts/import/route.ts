import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { accountTitleKey, titleTakenMessage } from '@/lib/account-title'

const VALID_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
const VALID_BALANCES = ['DEBIT', 'CREDIT']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

const DEFAULT_BALANCE: Record<string, string> = {
  ASSET: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  REVENUE: 'CREDIT',
  EXPENSE: 'DEBIT',
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { accounts } = await req.json()

    if (!Array.isArray(accounts) || accounts.length === 0) {
      return NextResponse.json({ error: 'Accounts array is required' }, { status: 400 })
    }

    // Validate all rows
    const errors: { index: number; error: string }[] = []
    const validated = accounts.map((acc: {
      accountNumber: string
      accountTitle: string
      accountType: string
      subType: string
      normalBalance: string
      description: string
    }, i: number) => {
      if (!acc.accountNumber?.trim() || !acc.accountTitle?.trim()) {
        errors.push({ index: i, error: 'Account number and title are required' })
        return null
      }
      const type = acc.accountType?.trim().toUpperCase()
      if (!VALID_TYPES.includes(type)) {
        errors.push({ index: i, error: `Invalid account type: ${acc.accountType}` })
        return null
      }
      const balance = acc.normalBalance?.trim().toUpperCase()
      const finalBalance = VALID_BALANCES.includes(balance) ? balance : DEFAULT_BALANCE[type]

      return {
        accountNumber: acc.accountNumber.trim(),
        accountTitle: acc.accountTitle.trim(),
        accountType: type,
        subType: acc.subType?.trim() || null,
        normalBalance: finalBalance,
        description: acc.description?.trim() || null,
        createdById: session.user.id,
      }
    }).filter(Boolean)

    if (errors.length > 0) {
      return NextResponse.json({ error: 'Validation errors', errors }, { status: 400 })
    }

    // Insert all in a transaction
    let imported = 0
    const importErrors: { accountNumber: string; error: string }[] = []

    // A name already in the chart, or repeated earlier in this same file, is
    // refused per row like a repeated number.
    const byTitle = new Map(
      (await prisma.account.findMany({ select: { id: true, accountNumber: true, accountTitle: true, isActive: true } }))
        .map((a) => [accountTitleKey(a.accountTitle), a]),
    )

    for (const acc of validated) {
      const row = acc as { accountNumber: string; accountTitle: string }
      const named = byTitle.get(accountTitleKey(row.accountTitle))
      if (named) {
        importErrors.push({ accountNumber: row.accountNumber, error: titleTakenMessage(named) })
        continue
      }
      try {
        const created = await prisma.account.create({ data: acc as Parameters<typeof prisma.account.create>[0]['data'] })
        byTitle.set(accountTitleKey(created.accountTitle), created)
        imported++
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        const isUnique = message.includes('Unique constraint')
        importErrors.push({
          accountNumber: (acc as { accountNumber: string }).accountNumber,
          error: isUnique ? 'Account number already exists' : message,
        })
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'BULK_IMPORT',
        entity: 'account',
        details: {
          attempted: accounts.length,
          imported,
          failed: importErrors.length,
        },
      },
    })

    return NextResponse.json({ imported, errors: importErrors })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
