import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { listDesigns, refreshAccessToken } from '@/lib/canva'

async function getValidToken(): Promise<string | null> {
  const account = await prisma.canvaAccount.findFirst()
  if (!account) return null

  // Refresh if expired (or within 5 min of expiry)
  if (account.expiresAt && account.refreshToken) {
    const expiresIn = account.expiresAt.getTime() - Date.now()
    if (expiresIn < 5 * 60 * 1000) {
      try {
        const refreshed = await refreshAccessToken(
          process.env.CANVA_CLIENT_ID!,
          process.env.CANVA_CLIENT_SECRET!,
          account.refreshToken
        )
        const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000)
        // Canva uses rotating refresh tokens — always save the new one if provided
        await prisma.canvaAccount.update({
          where: { id: account.id },
          data: {
            accessToken: refreshed.access_token,
            expiresAt,
            ...(refreshed.refresh_token ? { refreshToken: refreshed.refresh_token } : {}),
          },
        })
        return refreshed.access_token
      } catch {
        return null
      }
    }
  }

  return account.accessToken
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q') || undefined
  const continuation = searchParams.get('continuation') || undefined

  // Check if Canva is connected
  const account = await prisma.canvaAccount.findFirst()
  if (!account) {
    return NextResponse.json({ connected: false, designs: [] })
  }

  const token = await getValidToken()
  if (!token) {
    return NextResponse.json({ connected: false, error: 'Token expired. Please reconnect Canva.' }, { status: 401 })
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
      return NextResponse.json({ connected: false, error: 'Canva token expired. Please reconnect.' }, { status: 401 })
    }
    console.error('Canva designs error:', err)
    return NextResponse.json({ error: 'Failed to fetch designs' }, { status: 500 })
  }
}
