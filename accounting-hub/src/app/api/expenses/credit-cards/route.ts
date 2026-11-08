import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cardDigits, findSameCard, duplicateCardMessage } from '@/lib/credit-card-unique'

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
    if (cardDigits(cardNumber).length < 4) {
      return NextResponse.json({ error: 'Enter the full credit card number.' }, { status: 400 })
    }
    // One number, one card per branch: an active copy blocks the add; a switched-off
    // copy is switched back on (keeping its statements) instead of saving a new one.
    const branchCards = await prisma.creditCard.findMany({ where: { branch } })
    const { active, inactive } = findSameCard(branchCards, cardNumber)
    if (active) return NextResponse.json({ error: duplicateCardMessage(active) }, { status: 409 })
    if (inactive) {
      const card = await prisma.creditCard.update({
        where: { id: inactive.id },
        data: { isActive: true, bank: String(bank), cardNumber: String(cardNumber), bankCode: String(bankCode) },
      })
      await prisma.auditLog.create({
        data: { userId: session.user.id, action: 'UPDATE', entity: 'credit_card', entityId: card.id, details: { reactivated: true, before: { bank: inactive.bank, bankCode: inactive.bankCode } } },
      }).catch(() => null)
      return NextResponse.json({ ...card, reactivated: true })
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

// PUT /api/expenses/credit-cards  { id, bank, cardNumber, bankCode } — fix a card in place
// (name, number, bank code) instead of removing and re-adding it. Existing SOAs and
// report refs keep the bank code they were numbered with; new ones use the new code.
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { id, bank, cardNumber, bankCode } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (!String(bank ?? '').trim() || !String(cardNumber ?? '').trim() || !String(bankCode ?? '').trim()) {
      return NextResponse.json({ error: 'bank, cardNumber and bankCode are required' }, { status: 400 })
    }
    if (cardDigits(cardNumber).length < 4) {
      return NextResponse.json({ error: 'Enter the full credit card number.' }, { status: 400 })
    }
    const before = await prisma.creditCard.findUnique({ where: { id: String(id) } })
    if (!before) return NextResponse.json({ error: 'Credit card not found' }, { status: 404 })
    const branchCards = await prisma.creditCard.findMany({ where: { branch: before.branch } })
    const { active, inactive } = findSameCard(branchCards, cardNumber, before.id)
    const clash = active || inactive
    if (clash) return NextResponse.json({ error: duplicateCardMessage(clash, true) }, { status: 409 })
    const card = await prisma.creditCard.update({
      where: { id: before.id },
      data: { bank: String(bank).trim(), cardNumber: String(cardNumber).trim(), bankCode: String(bankCode).trim() },
    })
    const changed = (['bank', 'cardNumber', 'bankCode'] as const).filter(k => before[k] !== card[k])
    if (changed.length) {
      await prisma.auditLog.create({
        data: { userId: session.user.id, action: 'UPDATE', entity: 'credit_card', entityId: card.id, details: { changed, before: { bank: before.bank, bankCode: before.bankCode } } },
      }).catch(() => null)
    }
    return NextResponse.json(card)
  } catch (e) {
    console.error('Credit card update error:', e)
    return NextResponse.json({ error: 'Failed to save credit card' }, { status: 500 })
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
