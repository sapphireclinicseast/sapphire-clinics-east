import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { accountTitleKey } from '@/lib/account-title'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { accounts } = await req.json()

    if (!Array.isArray(accounts) || accounts.length === 0) {
      return NextResponse.json({ error: 'Accounts array is required' }, { status: 400 })
    }

    const numbers = accounts.map((a: { accountNumber: string }) => a.accountNumber?.trim()).filter(Boolean)
    const titles = accounts.map((a: { accountTitle: string }) => a.accountTitle?.trim()).filter(Boolean)

    const existing = titles.length > 0
      ? await prisma.account.findMany({ select: { accountNumber: true, accountTitle: true } })
      : await prisma.account.findMany({ where: { accountNumber: { in: numbers } }, select: { accountNumber: true, accountTitle: true } })

    const existingNumbers = new Set(existing.map((e) => e.accountNumber))
    // Same comparison the import itself enforces: case and extra spaces ignored.
    const existingTitles = new Set(existing.map((e) => accountTitleKey(e.accountTitle)))

    const duplicates = accounts.map((acc: { accountNumber: string; accountTitle: string }, index: number) => {
      const numberMatch = existingNumbers.has(acc.accountNumber?.trim())
      const titleMatch = !!acc.accountTitle?.trim() && existingTitles.has(accountTitleKey(acc.accountTitle))

      if (numberMatch || titleMatch) {
        return { index, numberMatch, titleMatch }
      }
      return null
    }).filter(Boolean)

    return NextResponse.json({ duplicates })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
