import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

/**
 * The rate used to present the statements in another currency.
 *
 * GET  ?currency=USD&asOf=2026-12-31 — the most recent rate on or before that date,
 *      so a report defaults to the rate in force for the period rather than asking
 *      every time. Investors compare periods, so a consistent rate matters more than
 *      today's rate.
 * POST { currency, date, phpPerUnit } — record one. The table is shared with the
 *      CNY rates the forex flow already writes; these are simply MANUAL.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const currency = (sp.get('currency') || '').toUpperCase()
  const asOf = sp.get('asOf')
  if (!currency) return NextResponse.json({ error: 'currency is required' }, { status: 400 })

  const when = asOf ? new Date(asOf) : new Date()
  const rate = await prisma.exchangeRate.findFirst({
    where: { currency, date: { lte: when } },
    orderBy: { date: 'desc' },
    select: { phpPerUnit: true, date: true, source: true },
  })
  // Nothing on or before — fall back to the earliest known, flagged, rather than
  // pretending no rate exists at all.
  const fallback = rate ? null : await prisma.exchangeRate.findFirst({
    where: { currency }, orderBy: { date: 'asc' },
    select: { phpPerUnit: true, date: true, source: true },
  })
  const use = rate || fallback
  if (!use) return NextResponse.json({ currency, phpPerUnit: null })

  return NextResponse.json({
    currency,
    phpPerUnit: Number(use.phpPerUnit),
    rateDate: use.date.toISOString().slice(0, 10),
    source: use.source,
    onOrBefore: !!rate,
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { currency, date, phpPerUnit } = await req.json()
    const code = String(currency || '').toUpperCase()
    const rate = Number(phpPerUnit)
    if (!code) return NextResponse.json({ error: 'currency is required' }, { status: 400 })
    if (!(rate > 0)) return NextResponse.json({ error: 'Enter how many pesos make one unit' }, { status: 400 })

    const on = date ? new Date(date) : new Date()
    const day = new Date(Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate()))
    const saved = await prisma.exchangeRate.upsert({
      where: { currency_date: { currency: code, date: day } },
      update: { phpPerUnit: rate, source: 'MANUAL' },
      create: { currency: code, date: day, phpPerUnit: rate, source: 'MANUAL', note: 'Reports presentation rate', createdById: session.user.id ?? null },
    })
    return NextResponse.json({ id: saved.id, currency: code, phpPerUnit: rate, rateDate: day.toISOString().slice(0, 10) })
  } catch (e) {
    console.error('FX rate save failed:', e)
    return NextResponse.json({ error: 'Failed to save the rate' }, { status: 500 })
  }
}
