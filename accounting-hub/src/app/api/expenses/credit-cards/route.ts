import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']

// GET /api/expenses/credit-cards?branch=SANDBOX_EAST
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const branch = new URL(req.url).searchParams.get('branch') || ''
  if (!VALID_BRANCHES.includes(branch)) {
    return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
  }
  const cards = await prisma.creditCard.findMany({
    where: { branch, isActive: true },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(cards)
}

// POST /api/expenses/credit-cards  { branch, bank, cardNumber, bankCode }
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, bank, cardNumber, bankCode } = await req.json()
    if (!VALID_BRANCHES.includes(branch)) {
      return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    }
    if (!bank || !cardNumber || !bankCode) {
      return NextResponse.json({ error: 'bank, cardNumber and bankCode are required' }, { status: 400 })
    }
    // Store card number / bank code as strings — never coerce (preserve leading zeros).
    const card = await prisma.creditCard.create({
      data: { branch, bank: String(bank), cardNumber: String(cardNumber), bankCode: String(bankCode) },
    })
    return NextResponse.json(card)
  } catch (e) {
    console.error('Credit card create error:', e)
    return NextResponse.json({ error: 'Failed to add credit card' }, { status: 500 })
  }
}

// DELETE /api/expenses/credit-cards?id=...   (soft delete)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await prisma.creditCard.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ ok: true })
}
