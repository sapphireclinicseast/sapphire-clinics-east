import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import QRCode from 'qrcode'
import crypto from 'crypto'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Generate a one-time token
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

  await prisma.captureToken.create({
    data: {
      scheduleId: id,
      token,
      expiresAt,
    },
  })

  // Build capture URL
  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://teletherapy.sapphireclinicseast.org'
  const captureUrl = `${baseUrl}/capture/${id}?token=${token}`

  // Generate QR as data URL
  const qrDataUrl = await QRCode.toDataURL(captureUrl, {
    width: 300,
    margin: 2,
    color: {
      dark: '#1C2B30',
      light: '#FFFFFF',
    },
  })

  return NextResponse.json({ qrDataUrl, captureUrl })
}
