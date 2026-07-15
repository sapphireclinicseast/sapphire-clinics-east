import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  fetchUserPages,
  getInstagramAccountForPage,
  exchangeForLongLivedToken,
  verifyToken,
  META_API_BASE,
} from '@/lib/meta'

// GET — list all connected social accounts
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await prisma.socialAccount.findMany({
    orderBy: [{ platform: 'asc' }, { pageName: 'asc' }],
  })

  // Mask access tokens for security (show only last 6 chars)
  const masked = accounts.map((a) => ({
    ...a,
    accessToken: `••••••••${a.accessToken.slice(-6)}`,
  }))

  return NextResponse.json({ accounts: masked })
}

// POST — add accounts via User Access Token (auto-imports all pages + IG accounts)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userAccessToken, manualEntry } = await req.json()

  // ── Manual single-account entry ──────────────────────────────────────────
  if (manualEntry) {
    const { platform, pageId, pageName, accessToken, profileUrl } = manualEntry

    if (!platform || !pageId || !accessToken) {
      return NextResponse.json({ error: 'platform, pageId, and accessToken are required' }, { status: 400 })
    }

    // Check if already connected
    const existing = await prisma.socialAccount.findFirst({
      where: { platform, accountId: pageId },
    })
    if (existing) {
      // Update token
      await prisma.socialAccount.update({
        where: { id: existing.id },
        data: { accessToken, pageName, profileUrl, updatedAt: new Date() },
      })
      return NextResponse.json({ message: 'Account updated', count: 1 })
    }

    await prisma.socialAccount.create({
      data: {
        platform,
        accessToken,
        accountId: pageId,
        pageId,
        pageName,
        profileUrl,
      },
    })
    return NextResponse.json({ message: 'Account connected', count: 1 })
  }

  // ── Auto-import via User Access Token ────────────────────────────────────
  if (!userAccessToken) {
    return NextResponse.json({ error: 'userAccessToken required' }, { status: 400 })
  }

  // Exchange for long-lived token first
  let longLivedToken = userAccessToken
  try {
    longLivedToken = await exchangeForLongLivedToken(userAccessToken)
  } catch {
    // If exchange fails, use the original token (might already be long-lived)
    console.warn('Token exchange failed, using original token')
  }

  // Fetch all pages the user manages
  const pages = await fetchUserPages(longLivedToken)
  if (!pages.length) {
    return NextResponse.json({ error: 'No Facebook pages found for this token' }, { status: 400 })
  }

  let fbAdded = 0
  let igAdded = 0

  for (const page of pages) {
    // Add Facebook Page
    const existing = await prisma.socialAccount.findFirst({
      where: { platform: 'FACEBOOK', accountId: page.id },
    })

    if (existing) {
      await prisma.socialAccount.update({
        where: { id: existing.id },
        data: { accessToken: page.access_token, pageName: page.name, updatedAt: new Date() },
      })
    } else {
      await prisma.socialAccount.create({
        data: {
          platform: 'FACEBOOK',
          accessToken: page.access_token,
          accountId: page.id,
          pageId: page.id,
          pageName: page.name,
          profileUrl: `https://facebook.com/${page.id}`,
        },
      })
    }
    fbAdded++

    // Try to link Instagram Business Account
    try {
      const igAccount = await getInstagramAccountForPage(page.id, page.access_token)
      if (igAccount) {
        const existingIg = await prisma.socialAccount.findFirst({
          where: { platform: 'INSTAGRAM', accountId: igAccount.id },
        })

        if (existingIg) {
          await prisma.socialAccount.update({
            where: { id: existingIg.id },
            data: { accessToken: page.access_token, pageName: igAccount.username ?? igAccount.name, updatedAt: new Date() },
          })
        } else {
          await prisma.socialAccount.create({
            data: {
              platform: 'INSTAGRAM',
              accessToken: page.access_token,
              accountId: igAccount.id,
              pageId: igAccount.id,
              pageName: `@${igAccount.username ?? igAccount.name}` ,
              profileUrl: `https://instagram.com/${igAccount.username}`,
            },
          })
        }
        igAdded++
      }
    } catch {
      // Instagram not linked to this page — skip
    }
  }

  return NextResponse.json({
    message: `Connected ${fbAdded} Facebook page(s) and ${igAdded} Instagram account(s)`,
    fbAdded,
    igAdded,
  })
}

// PATCH — sync page names from Facebook/Instagram Graph API
export async function PATCH() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await prisma.socialAccount.findMany()
  let updated = 0

  await Promise.all(
    accounts.map(async (account) => {
      try {
        if (account.platform === 'FACEBOOK') {
          const res = await fetch(
            `${META_API_BASE}/${account.accountId}?fields=name&access_token=${account.accessToken}`
          )
          if (!res.ok) return
          const data = await res.json()
          if (data.name && data.name !== account.pageName) {
            await prisma.socialAccount.update({
              where: { id: account.id },
              data: { pageName: data.name, updatedAt: new Date() },
            })
            updated++
          }
        } else if (account.platform === 'INSTAGRAM') {
          const res = await fetch(
            `${META_API_BASE}/${account.accountId}?fields=username&access_token=${account.accessToken}`
          )
          if (!res.ok) return
          const data = await res.json()
          if (data.username) {
            const newName = `@${data.username}`
            if (newName !== account.pageName) {
              await prisma.socialAccount.update({
                where: { id: account.id },
                data: { pageName: newName, updatedAt: new Date() },
              })
              updated++
            }
          }
        }
      } catch {
        // Skip accounts with expired/invalid tokens
      }
    })
  )

  return NextResponse.json({ message: `Synced names for ${updated} account(s)`, updated })
}

// DELETE — disconnect an account
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.socialAccount.delete({ where: { id } })
  return NextResponse.json({ message: 'Account disconnected' })
}
