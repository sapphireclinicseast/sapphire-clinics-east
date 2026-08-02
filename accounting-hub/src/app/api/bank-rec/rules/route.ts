import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ruleMatches } from '@/lib/bank-rec-rules'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rules = await prisma.bankCategoryRule.findMany({ orderBy: { createdAt: 'asc' } })
  // Count what each rule would catch today, so the list shows live reach.
  const pending = await prisma.bankTransaction.findMany({
    where: { status: 'PENDING' },
    select: { description: true, fromToName: true, spent: true, received: true, bankAccountId: true },
  })
  const catIds = [...new Set(rules.map(r => r.categoryAccountId))]
  const accts = catIds.length ? await prisma.account.findMany({ where: { id: { in: catIds } }, select: { id: true, accountNumber: true, accountTitle: true } }) : []
  const byId = new Map(accts.map(a => [a.id, `${a.accountNumber} ${a.accountTitle}`]))
  const claimed = new Set<number>()
  const withCounts = rules.map(r => {
    let n = 0
    pending.forEach((t, i) => {
      if (!claimed.has(i) && r.active && ruleMatches(r, t)) { claimed.add(i); n++ }
    })
    return { ...r, pendingMatches: n, categoryLabel: byId.get(r.categoryAccountId) || r.categoryAccountId }
  })
  return NextResponse.json({ rules: withCounts, pendingTotal: pending.length })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json()
  const pattern = String(body.pattern || '').trim()
  if (pattern.length < 3) return NextResponse.json({ error: 'Pattern must be at least 3 characters — shorter would catch lines it should not' }, { status: 400 })
  if (!body.categoryAccountId) return NextResponse.json({ error: 'Choose a category account' }, { status: 400 })
  const direction = ['OUT', 'IN', 'ANY'].includes(body.direction) ? body.direction : 'ANY'
  const rule = await prisma.bankCategoryRule.create({
    data: {
      pattern, direction,
      bankAccountId: body.bankAccountId || null,
      categoryAccountId: body.categoryAccountId,
      fromToName: body.fromToName?.trim() || null,
      createdById: session.user.id as string,
    },
  })
  return NextResponse.json({ rule })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const rule = await prisma.bankCategoryRule.update({
    where: { id: body.id },
    data: {
      ...(body.pattern !== undefined ? { pattern: String(body.pattern).trim() } : {}),
      ...(body.direction !== undefined ? { direction: body.direction } : {}),
      ...(body.active !== undefined ? { active: !!body.active } : {}),
      ...(body.categoryAccountId !== undefined ? { categoryAccountId: body.categoryAccountId } : {}),
      ...(body.fromToName !== undefined ? { fromToName: body.fromToName?.trim() || null } : {}),
    },
  })
  return NextResponse.json({ rule })
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await prisma.bankCategoryRule.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
