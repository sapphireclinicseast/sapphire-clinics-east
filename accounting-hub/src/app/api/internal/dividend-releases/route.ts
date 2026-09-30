/**
 * GET /api/internal/dividend-releases
 *
 * Internal endpoint consumed by the HR Hub "Shareholders › Dividend Release"
 * tab. Returns every dividend that has actually been RELEASED here — the
 * green, ticked cells in Equity › Dividend Release History — with the
 * shareholder's email so HR can send its thank-you note:
 *
 *   - preferred: every PreferredDividendRelease item (created by "Record
 *     selected" / "Record dividend manually"; paidDate = the payout date)
 *   - common:    items of FINALIZED DividendRelease rows only. A DRAFT
 *     release has no items yet and nothing has been paid.
 *
 * Items are flat (one row per shareholder per release) because that is the
 * unit HR thanks and logs: item.id is stable for the life of the release
 * and is what HR keys its "already thanked" log on.
 *
 * Auth: x-api-key: ${ACCOUNTING_INTERNAL_KEY} — must be set in the container env
 * (docker/.env); unlike /api/internal/equity this route has no built-in default.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const KEY = process.env.ACCOUNTING_INTERNAL_KEY || process.env.HR_INTERNAL_KEY || ''
const num = (v: unknown) => Number(v || 0)

function verify(req: NextRequest): boolean {
  if (!KEY) return false   // key must be configured in the container env; no built-in default here
  const k = req.headers.get('x-api-key')
  const bearer = req.headers.get('authorization')
  return k === KEY || bearer === `Bearer ${KEY}`
}

export async function GET(req: NextRequest) {
  if (!verify(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const [pref, common] = await Promise.all([
      prisma.preferredDividendRelease.findMany({ include: { items: true }, orderBy: { date: 'desc' } }),
      prisma.dividendRelease.findMany({ where: { status: 'FINALIZED' }, include: { items: true }, orderBy: { date: 'desc' } }),
    ])
    // One email lookup for every shareholder referenced, not one query per item.
    const ids = new Set<string>()
    for (const r of pref) for (const i of r.items) ids.add(i.shareholderId)
    for (const r of common) for (const i of r.items) ids.add(i.shareholderId)
    const holders = ids.size ? await prisma.shareholder.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, email: true, shNumber: true } }) : []
    const byId = new Map(holders.map((h) => [h.id, h]))

    const preferred = pref.flatMap((r) => r.items.map((i) => ({
      id: i.id, kind: 'preferred' as const, releaseId: r.id,
      releaseDate: r.date, paidDate: i.paidDate || r.date, recordedAt: r.createdAt,
      quarterKey: r.quarterKey, periodLabel: r.periodLabel || r.quarterKey,
      shareholderId: i.shareholderId, shareholderName: byId.get(i.shareholderId)?.name || i.shareholderName,
      shNumber: byId.get(i.shareholderId)?.shNumber || '', email: byId.get(i.shareholderId)?.email || '',
      shares: num(i.shares), amount: num(i.amount), noticeEmailedAt: i.emailedAt,
    })))
    const commonItems = common.flatMap((r) => r.items.map((i) => ({
      id: i.id, kind: 'common' as const, releaseId: r.id,
      releaseDate: r.date, paidDate: r.date, recordedAt: r.finalizedAt || r.createdAt, finalizedAt: r.finalizedAt,
      dividendType: r.dividendType, perShare: num(r.dividendAmount),
      periodLabel: `${r.dividendType === 'SPECIAL' ? 'Special' : 'Regular'} dividend · ${new Date(r.date).toISOString().slice(0, 10)}`,
      shareholderId: i.shareholderId, shareholderName: byId.get(i.shareholderId)?.name || i.shareholderName,
      shNumber: byId.get(i.shareholderId)?.shNumber || '', email: byId.get(i.shareholderId)?.email || '',
      shares: num(i.shares), amount: num(i.amount), noticeEmailedAt: i.emailedAt,
    })))
    return NextResponse.json({ ok: true, preferred, common: commonItems, generatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('[internal/dividend-releases] failed:', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
