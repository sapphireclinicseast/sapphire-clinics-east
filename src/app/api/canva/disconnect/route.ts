import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getValidCanvaToken } from '@/lib/canva'

export async function DELETE() {
  try {
    await prisma.canvaAccount.deleteMany()
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Canva disconnect error:', err)
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
}

export async function GET() {
  const account = await prisma.canvaAccount.findFirst()
  if (!account) {
    return NextResponse.json({ connected: false, displayName: null, connectedAt: null })
  }

  // Proactively refresh if near expiry so the status check keeps the session alive
  const token = await getValidCanvaToken()

  return NextResponse.json({
    connected: !!token,
    displayName: account?.displayName || null,
    connectedAt: account?.connectedAt || null,
  })
}
