import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

// GET ?currency=CNY → rates on file, newest first.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const currency = new URL(req.url).searchParams.get('currency') || ''
  const rates = await prisma.exchangeRate.findMany({
    where: currency ? { currency } : {},
    orderBy: [{ currency: 'asc' }, { date: 'desc' }],
    take: 200,
  })
  return NextResponse.json(rates.map(r => ({
    id: r.id, currency: r.currency, date: r.date.toISOString().slice(0, 10),
    phpPerUnit: Number(r.phpPerUnit), source: r.source, note: r.note,
  })))
}

// POST { currency, date, phpPerUnit, note } — add or correct a rate by hand.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { currency, date, phpPerUnit, note } = await req.json()
    const rate = Number(phpPerUnit)
    if (!currency || !date || !(rate > 0)) {
      return NextResponse.json({ error: 'Currency, date and a rate greater than zero are required' }, { status: 400 })
    }
    const on = new Date(`${String(date).slice(0, 10)}T00:00:00.000Z`)
    const saved = await prisma.exchangeRate.upsert({
      where: { currency_date: { currency, date: on } },
      update: { phpPerUnit: rate, source: 'MANUAL', note: note || null },
      create: { currency, date: on, phpPerUnit: rate, source: 'MANUAL', note: note || null, createdById: session.user.id ?? null },
    })
    return NextResponse.json({ id: saved.id })
  } catch (e) {
    console.error('Exchange rate save error:', e)
    return NextResponse.json({ error: 'Failed to save rate' }, { status: 500 })
  }
}

// DELETE ?id=... — a rate already applied to a posted line is also kept on that
// line (BankTransaction.fxRate), so removing one here never rewrites what has
// already been posted to the ledger.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await prisma.exchangeRate.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ success: true })
}
