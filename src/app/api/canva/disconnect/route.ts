import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
  return NextResponse.json({
    connected: !!account,
    displayName: account?.displayName || null,
    connectedAt: account?.connectedAt || null,
  })
}
