import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/accounts?google_error=${encodeURIComponent(error)}`, req.url)
    )
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings/accounts?google_error=no_code', req.url))
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL('/settings/accounts?google_error=no_refresh_token', req.url)
      )
    }

    // Fetch user info (email + display name)
    oauth2Client.setCredentials(tokens)
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: userInfo } = await oauth2.userinfo.get()

    if (!userInfo.email) {
      return NextResponse.redirect(
        new URL('/settings/accounts?google_error=no_email', req.url)
      )
    }

    // Upsert into GmailAccount table
    await prisma.gmailAccount.upsert({
      where: { email: userInfo.email },
      update: {
        refreshToken: tokens.refresh_token,
        displayName: userInfo.name ?? userInfo.email,
        updatedAt: new Date(),
      },
      create: {
        email: userInfo.email,
        displayName: userInfo.name ?? userInfo.email,
        refreshToken: tokens.refresh_token,
      },
    })

    return NextResponse.redirect(new URL('/settings/accounts?google_connected=1', req.url))
  } catch (err) {
    console.error('Google OAuth callback error:', err)
    return NextResponse.redirect(
      new URL('/settings/accounts?google_error=token_exchange_failed', req.url)
    )
  }
}
