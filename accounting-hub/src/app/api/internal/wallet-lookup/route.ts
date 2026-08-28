import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'scei-internal-2026'

export async function GET(req: Request) {
  // Verify internal API key
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const barcode = searchParams.get('barcode')
  if (!barcode) {
    return NextResponse.json({ error: 'barcode is required' }, { status: 400 })
  }

  try {
    const wallet = await prisma.digitalWallet.findUnique({
      where: { barcode },
    })

    if (!wallet || !wallet.isActive) {
      return NextResponse.json({ error: 'Wallet not found or inactive' }, { status: 404 })
    }

    return NextResponse.json({
      id: wallet.id,
      barcode: wallet.barcode,
      patientName: wallet.patientName,
      rewardPoints: wallet.rewardPoints,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  // Verify internal API key
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { barcode, pointsToDeduct, reason } = await req.json()
    if (!barcode || !pointsToDeduct || pointsToDeduct < 1) {
      return NextResponse.json({ error: 'barcode and pointsToDeduct are required' }, { status: 400 })
    }

    const wallet = await prisma.digitalWallet.findUnique({ where: { barcode } })
    if (!wallet || !wallet.isActive) {
      return NextResponse.json({ error: 'Wallet not found or inactive' }, { status: 404 })
    }
    if (wallet.rewardPoints < pointsToDeduct) {
      return NextResponse.json({ error: 'Insufficient reward points' }, { status: 400 })
    }

    const balanceBefore = wallet.rewardPoints
    const balanceAfter  = balanceBefore - pointsToDeduct

    // Deduct points. WalletLog requires a createdById (user FK), so we skip
    // the log here — the balance update is the authoritative record for
    // system-initiated (seminar) deductions.
    await prisma.digitalWallet.update({
      where: { id: wallet.id },
      data: { rewardPoints: balanceAfter },
    })

    return NextResponse.json({ ok: true, balanceBefore, balanceAfter })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
