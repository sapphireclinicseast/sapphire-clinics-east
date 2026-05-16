// POST /api/public/wallet-lookup
// Body: { card: string }
// Returns minimal info for a VIP or PREPAID_CARD wallet so the patient portal
// can display the remaining reward points. No PII beyond the patient's name
// (which the patient just typed-in the card for, so they already know it).
//
// IP rate-limited. Only VIP and PREPAID_CARD wallets are searchable.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const ALLOWED_ORIGINS = [
  'https://client.sapphireclinicseast.org',
  'http://localhost:3001',
  'http://localhost:3004',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3004',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

// ── Simple in-memory rate limiter: 30 lookups per IP per minute ─────────────
const RATE = new Map<string, { n: number; reset: number }>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const cur = RATE.get(ip)
  if (!cur || cur.reset < now) {
    RATE.set(ip, { n: 1, reset: now + 60_000 })
    return false
  }
  if (cur.n >= 30) return true
  cur.n += 1
  return false
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests, please slow down.' }, { status: 429, headers })
  }

  const body = (await req.json().catch(() => ({}))) as { card?: string }
  const cardRaw = (body.card ?? '').trim().toUpperCase()
  if (!cardRaw) {
    return NextResponse.json({ error: 'Card number is required' }, { status: 400, headers })
  }
  // Light validation — most SCEI cards look like SCEI-V-123456 or SCEI-PC-12345
  if (cardRaw.length < 4 || cardRaw.length > 40) {
    return NextResponse.json({ error: 'Card number looks invalid' }, { status: 400, headers })
  }

  const wallet = await prisma.digitalWallet.findFirst({
    where: {
      barcode: cardRaw,
      walletType: { in: ['VIP', 'PREPAID_CARD'] },
      isActive: true,
    },
    select: {
      barcode: true,
      walletType: true,
      vipTier: true,
      branch: true,
      rewardPoints: true,
      balance: true,
      patientName: true,
    },
  })

  if (!wallet) {
    return NextResponse.json(
      { error: 'Card not found. Please check the number, or visit any branch to verify.' },
      { status: 404, headers },
    )
  }

  return NextResponse.json(
    {
      card: wallet.barcode,
      cardType: wallet.walletType, // "VIP" | "PREPAID_CARD"
      vipTier: wallet.vipTier ?? null,
      branch: wallet.branch,
      rewardPoints: wallet.rewardPoints,
      balance: Number(wallet.balance),
      // First initial + last initial only — enough for the patient to recognise
      // their own card, but not enough to leak a full name from a stolen card.
      holderInitials: (wallet.patientName ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0])
        .join('')
        .slice(0, 4)
        .toUpperCase(),
    },
    { headers },
  )
}
