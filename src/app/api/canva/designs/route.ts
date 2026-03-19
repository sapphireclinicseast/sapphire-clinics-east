import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { listDesigns, getValidCanvaToken } from '@/lib/canva'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q') || undefined
  const continuation = searchParams.get('continuation') || undefined

  const account = await prisma.canvaAccount.findFirst()
  if (!account) {
    return NextResponse.json({ connected: false, designs: [] })
  }

  const token = await getValidCanvaToken()
  if (!token) {
    return NextResponse.json({ connected: false, error: 'Canva session expired. Please reconnect.' }, { status: 401 })
  }

  try {
    const result = await listDesigns(token, query, continuation)
    return NextResponse.json({
      connected: true,
      designs: result.items,
      continuation: result.continuation,
      displayName: account.displayName,
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ connected: false, error: 'Canva session expired. Please reconnect.' }, { status: 401 })
    }
    console.error('Canva designs error:', err)
    return NextResponse.json({ error: 'Failed to fetch designs' }, { status: 500 })
  }
}
