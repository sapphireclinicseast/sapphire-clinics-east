import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import {
  fetchUserPages,
  getInstagramAccountForPage,
  exchangeForLongLivedToken,
  META_API_BASE,
} from '@/lib/meta'

// Use NEXTAUTH_URL as base for all redirects so they always go to the public
// domain even when req.url sees the internal Docker address (0.0.0.0:3000).
function appUrl(path: string) {
  const base = process.env.NEXTAUTH_URL || 'https://operations.sapphireclinicseast.org'
  return new URL(path, base)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.redirect(appUrl('/login'))
  }

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorReason = searchParams.get('error_reason')

  if (error) {
    const msg = errorReason === 'user_denied'
      ? 'You cancelled the Facebook connection.'
      : `Facebook error: ${error}`
    return NextResponse.redirect(
      appUrl(`/settings/accounts?fb_error=${encodeURIComponent(msg)}`)
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      appUrl('/settings/accounts?fb_error=missing_code')
    )
  }

  // Verify state (CSRF protection)
  const cookieStore = await cookies()
  const savedState = cookieStore.get('fb_oauth_state')?.value
  cookieStore.delete('fb_oauth_state')

  if (!savedState || savedState !== state) {
    return NextResponse.redirect(
      appUrl('/settings/accounts?fb_error=invalid_state')
    )
  }

  const appId = process.env.META_APP_ID!
  const appSecret = process.env.META_APP_SECRET!
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/social/facebook/callback`

  try {
    // Step 1: Exchange code for short-lived user access token
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    })
    const tokenRes = await fetch(`${META_API_BASE}/oauth/access_token?${tokenParams}`)
    const tokenData = await tokenRes.json()

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Facebook code exchange error:', tokenData)
      return NextResponse.redirect(
        appUrl(`/settings/accounts?fb_error=${encodeURIComponent(tokenData.error?.message ?? 'token_exchange_failed')}`)
      )
    }

    const shortLivedToken: string = tokenData.access_token

    // Step 2: Exchange for long-lived user token (60 days)
    let longLivedToken = shortLivedToken
    try {
      longLivedToken = await exchangeForLongLivedToken(shortLivedToken)
    } catch (e) {
      console.warn('Long-lived token exchange failed, using short-lived token:', e)
    }

    // Step 3: Fetch all pages user manages (each page has its own never-expiring page token)
    const pages = await fetchUserPages(longLivedToken)

    if (!pages.length) {
      return NextResponse.redirect(
        new URL('/settings/accounts?fb_error=no_pages_found', req.url)
      )
    }

    let fbAdded = 0
    let igAdded = 0

    for (const page of pages) {
      // Page access tokens derived this way don't expire
      const pageToken = page.access_token

      // Upsert Facebook page
      const existing = await prisma.socialAccount.findFirst({
        where: { platform: 'FACEBOOK', accountId: page.id },
      })

      if (existing) {
        await prisma.socialAccount.update({
          where: { id: existing.id },
          data: {
            accessToken: pageToken,
            pageName: page.name,
            updatedAt: new Date(),
          },
        })
      } else {
        await prisma.socialAccount.create({
          data: {
            platform: 'FACEBOOK',
            accessToken: pageToken,
            accountId: page.id,
            pageId: page.id,
            pageName: page.name,
            profileUrl: `https://facebook.com/${page.id}`,
          },
        })
      }
      fbAdded++

      // Try to get linked Instagram Business Account
      try {
        const igAccount = await getInstagramAccountForPage(page.id, pageToken)
        if (igAccount) {
          const existingIg = await prisma.socialAccount.findFirst({
            where: { platform: 'INSTAGRAM', accountId: igAccount.id },
          })

          const igName = `@${igAccount.username ?? igAccount.name}`

          if (existingIg) {
            await prisma.socialAccount.update({
              where: { id: existingIg.id },
              data: {
                accessToken: pageToken,
                pageName: igName,
                updatedAt: new Date(),
              },
            })
          } else {
            await prisma.socialAccount.create({
              data: {
                platform: 'INSTAGRAM',
                accessToken: pageToken,
                accountId: igAccount.id,
                pageId: igAccount.id,
                pageName: igName,
                profileUrl: `https://instagram.com/${igAccount.username}`,
              },
            })
          }
          igAdded++
        }
      } catch {
        // No Instagram linked to this page
      }
    }

    const summary = `${fbAdded}fb${igAdded}ig`
    return NextResponse.redirect(appUrl(`/settings/accounts?fb_connected=${summary}`))
  } catch (err) {
    console.error('Facebook OAuth callback error:', err)
    return NextResponse.redirect(appUrl('/settings/accounts?fb_error=unexpected_error'))
  }
}
