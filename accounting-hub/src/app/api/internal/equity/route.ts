/**
 * GET /api/internal/equity
 *
 * Internal endpoint consumed by the HR Hub "Shareholders" section. Returns the
 * common and preferred shareholders (from the Equity register) with the summary
 * fields HR needs. File URLs (valid ID, proof of deposit) are returned absolute.
 *
 * Auth: x-api-key: ${ACCOUNTING_INTERNAL_KEY}  (default matches HR's default)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const KEY = process.env.ACCOUNTING_INTERNAL_KEY || process.env.HR_INTERNAL_KEY || 'scei-internal-2026'
const BASE = process.env.ACCOUNTING_PUBLIC_URL || 'https://accounting.sapphireclinicseast.org'
const num = (v: unknown) => Number(v || 0)

function verify(req: NextRequest): boolean {
  const k = req.headers.get('x-api-key')
  const bearer = req.headers.get('authorization')
  return k === KEY || bearer === `Bearer ${KEY}`
}

function absUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return []
  return urls.map((u) => {
    const s = String(u || '')
    if (!s) return ''
    if (/^https?:\/\//i.test(s)) return s
    return BASE + (s.startsWith('/') ? '' : '/') + s
  }).filter(Boolean)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any) {
  return {
    id: r.id,
    shareholderId: r.shareholderId,
    subscriber: r.shareholder?.name || '',
    shNumber: r.shareholder?.shNumber || '',
    tin: r.shareholder?.tin || '',
    email: r.shareholder?.email || '',
    birthdate: r.shareholder?.birthdate || null,
    address: r.shareholder?.address || '',
    class: r.shareClass || '',
    dateAcquired: r.dateAcquired,
    shares: num(r.numberOfShares),
    buybackShares: (Array.isArray(r.buybacks) ? r.buybacks : []).reduce((s: number, b: { shares?: unknown }) => s + num(b.shares), 0),
    truePar: num(r.truePar),
    apic: num(r.apic),
    pricePerShare: num(r.pricePerShare),
    total: num(r.numberOfShares) * num(r.pricePerShare),
    validIdUrls: absUrls(r.validIdUrls),
    proofUrls: absUrls(r.proofOfDepositUrls),
  }
}

export async function GET(req: NextRequest) {
  if (!verify(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const [commons, preferreds, settings] = await Promise.all([
      prisma.commonShare.findMany({ include: { shareholder: true, buybacks: true }, orderBy: { createdAt: 'asc' } }),
      prisma.preferredShare.findMany({ include: { shareholder: true }, orderBy: { createdAt: 'asc' } }),
      prisma.equitySettings.findUnique({ where: { id: 'singleton' } }).catch(() => null),
    ])
    // Authoritative equity figures — computed exactly like the accounting Equity page.
    const authorizedShares = settings?.authorizedShares ?? 20000000
    const grossCommonShares = commons.reduce((s, c) => s + num(c.numberOfShares), 0)
    const treasuryBought = commons.reduce((s, c) => s + (c.buybacks || []).reduce((t, b) => t + num(b.shares), 0), 0)
    const totalShares = grossCommonShares - treasuryBought            // outstanding common (net of buybacks)
    const treasuryShares = Math.max(0, authorizedShares - totalShares) // available-for-sale
    const commonCap = commons.reduce((s, c) => s + num(c.numberOfShares) * num(c.pricePerShare), 0)
    const prefCap = preferreds.reduce((s, p) => s + num(p.numberOfShares) * num(p.pricePerShare), 0)
    return NextResponse.json({
      ok: true,
      common: commons.map(mapRow),
      preferred: preferreds.map(mapRow),
      figures: {
        authorizedShares,
        grossCommonShares,
        outstandingCommonShares: totalShares,   // == accounting "Total Number of Shares (outstanding)"
        treasuryBought,
        treasuryShares,
        totalCapitalization: commonCap + prefCap,
      },
    })
  } catch (err) {
    console.error('[internal/equity] failed:', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
