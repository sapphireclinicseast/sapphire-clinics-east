import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForToken } from '@/lib/canva'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings/accounts?canva=error&message=${encodeURIComponent(error)}`
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings/accounts?canva=error&message=missing_params`
    )
  }

  const cookieStore = await cookies()
  const savedState = cookieStore.get('canva_state')?.value
  const codeVerifier = cookieStore.get('canva_code_verifier')?.value

  if (!savedState || savedState !== state || !codeVerifier) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings/accounts?canva=error&message=invalid_state`
    )
  }

  // Clear the cookies
  cookieStore.delete('canva_state')
  cookieStore.delete('canva_code_verifier')

  try {
    const clientId = process.env.CANVA_CLIENT_ID!
    const clientSecret = process.env.CANVA_CLIENT_SECRET!
    const redirectUri = `${process.env.NEXTAUTH_URL}/api/canva/callback`

    const tokenData = await exchangeCodeForToken(clientId, clientSecret, code, codeVerifier, redirectUri)

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)

    // Fetch Canva user info
    let displayName: string | undefined
    let canvaUserId: string | undefined
    try {
      const userRes = await fetch('https://api.canva.com/rest/v1/users/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      if (userRes.ok) {
        const userData = await userRes.json()
        displayName = userData.profile?.display_name || userData.email
        canvaUserId = userData.id
      }
    } catch {
      // non-critical, continue
    }

    // Upsert — only one Canva account per app
    const existing = await prisma.canvaAccount.findFirst()
    if (existing) {
      await prisma.canvaAccount.update({
        where: { id: existing.id },
        data: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt,
          displayName,
          canvaUserId,
        },
      })
    } else {
      await prisma.canvaAccount.create({
        data: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt,
          displayName,
          canvaUserId,
        },
      })
    }

    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings/accounts?canva=connected`
    )
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('Canva callback error:', detail)
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings/accounts?canva=error&message=${encodeURIComponent(detail)}`
    )
  }
}
