import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

// POST /api/expenses/pay
// { entryIds:[], datePaid, paymentMethod, checkNumber?, paymentBankAccount?, creditCard?, payrollAccount? }
// Bulk-marks the selected expense entries as paid (locks them).
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const entryIds: string[] = Array.isArray(body.entryIds) ? body.entryIds : []
    if (entryIds.length === 0) {
      return NextResponse.json({ error: 'No entries selected' }, { status: 400 })
    }
    const paidAt = body.datePaid ? new Date(body.datePaid) : new Date()
    // All account / check numbers kept as strings to preserve leading zeros.
    const data = {
      paidAt,
      paymentMethod: body.paymentMethod ? String(body.paymentMethod) : null,
      checkNumber: body.checkNumber != null && body.checkNumber !== '' ? String(body.checkNumber) : null,
      paymentBankAccount: body.paymentBankAccount ? String(body.paymentBankAccount) : null,
      creditCard: body.creditCard ? String(body.creditCard) : null,
      creditCardId: body.creditCardId ? String(body.creditCardId) : null,
      payrollAccount: body.payrollAccount != null && body.payrollAccount !== '' ? String(body.payrollAccount) : null,
    }
    const res = await prisma.pettyCashEntry.updateMany({
      where: { id: { in: entryIds }, paidAt: null },
      data,
    })
    return NextResponse.json({ ok: true, count: res.count })
  } catch (e) {
    console.error('Expense pay error:', e)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }
}

// PATCH /api/expenses/pay  { entryIds:[] }  — un-pay (unlock) selected entries
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const entryIds: string[] = Array.isArray(body.entryIds) ? body.entryIds : []
    if (entryIds.length === 0) return NextResponse.json({ error: 'No entries selected' }, { status: 400 })
    const res = await prisma.pettyCashEntry.updateMany({
      where: { id: { in: entryIds } },
      data: { paidAt: null, paymentMethod: null, checkNumber: null, paymentBankAccount: null, creditCard: null, creditCardId: null, payrollAccount: null },
    })
    return NextResponse.json({ ok: true, count: res.count })
  } catch (e) {
    console.error('Expense unpay error:', e)
    return NextResponse.json({ error: 'Failed to unlock entries' }, { status: 500 })
  }
}
