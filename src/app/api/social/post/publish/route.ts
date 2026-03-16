// POST /api/social/post/publish
// Manually (re-)publishes a scheduled post immediately.
// Body: { postId: string }

import { NextRequest, NextResponse } from 'next/server'

// Allow up to 3 min — Instagram video containers can take up to 2 min to process
export const maxDuration = 180
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postToFacebook, postToInstagram, postVideoToFacebook, postVideoToInstagram } from '@/lib/meta'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await req.json()
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })

  const post = await prisma.scheduledPost.findUnique({ where: { id: postId } })
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  if (post.status === 'PUBLISHED') {
    return NextResponse.json({ error: 'Post already published' }, { status: 400 })
  }

  const errors: string[] = []
  const publishedIds: string[] = []

  // Resolve imageUrl — ensure it's an absolute URL Meta's servers can fetch
  let resolvedImageUrl = post.imageUrl ?? undefined
  if (resolvedImageUrl && !resolvedImageUrl.startsWith('http')) {
    const baseUrl = process.env.NEXTAUTH_URL
      ?? `${req.headers.get('x-forwarded-proto') ?? 'https'}://${req.headers.get('x-forwarded-host') ?? req.headers.get('host')}`
    resolvedImageUrl = `${baseUrl}${resolvedImageUrl.startsWith('/') ? '' : '/'}${resolvedImageUrl}`
  }

  // Load selected accounts (fall back to platform filter for legacy posts)
  const socialAccounts = await prisma.socialAccount.findMany({
    where: post.accountIds.length > 0
      ? { id: { in: post.accountIds } }
      : post.platforms.length > 0
        ? { platform: { in: post.platforms as any } }
        : undefined,
  })

  if (!socialAccounts.length) {
    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: { status: 'FAILED', errorMsg: 'No connected accounts found for this post' },
    })
    return NextResponse.json(
      { error: 'No connected accounts found for this post' },
      { status: 400 }
    )
  }

  const isVideo = post.mediaType === 'video'

  for (const acct of socialAccounts) {
    try {
      if (acct.platform === 'FACEBOOK') {
        if (isVideo && resolvedImageUrl) {
          const result = await postVideoToFacebook({
            description: post.content,
            videoUrl: resolvedImageUrl,
            account: {
              accessToken: acct.accessToken,
              pageId: acct.pageId ?? acct.accountId,
              pageName: acct.pageName ?? undefined,
            },
          })
          publishedIds.push(`FB:${acct.pageName}:${result.id}`)
        } else {
          const result = await postToFacebook({
            message: post.content,
            imageUrl: resolvedImageUrl,
            account: {
              accessToken: acct.accessToken,
              pageId: acct.pageId ?? acct.accountId,
              pageName: acct.pageName ?? undefined,
            },
          })
          publishedIds.push(`FB:${acct.pageName}:${result.id}`)
        }
      } else if (acct.platform === 'INSTAGRAM') {
        if (!resolvedImageUrl) {
          errors.push(`Instagram (${acct.pageName}): Media required for Instagram posts`)
        } else if (isVideo) {
          const result = await postVideoToInstagram({
            caption: post.content,
            videoUrl: resolvedImageUrl,
            account: {
              accessToken: acct.accessToken,
              pageId: acct.pageId ?? acct.accountId,
              pageName: acct.pageName ?? undefined,
            },
          })
          publishedIds.push(`IG:${acct.pageName}:${result.id}`)
        } else {
          const result = await postToInstagram({
            caption: post.content,
            imageUrl: resolvedImageUrl,
            account: {
              accessToken: acct.accessToken,
              pageId: acct.pageId ?? acct.accountId,
              pageName: acct.pageName ?? undefined,
            },
          })
          publishedIds.push(`IG:${acct.pageName}:${result.id}`)
        }
      }
    } catch (err) {
      errors.push(
        `${acct.platform} (${acct.pageName ?? acct.accountId}): ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    }
  }

  const newStatus = errors.length > 0 && publishedIds.length === 0 ? 'FAILED' : 'PUBLISHED'

  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: {
      status: newStatus as any,
      errorMsg: errors.length > 0 ? errors.join('; ') : null,
      publishedId: publishedIds.join(', ') || null,
    },
  })

  if (newStatus === 'FAILED') {
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 })
  }

  return NextResponse.json({
    message: `Published to ${publishedIds.length} account(s)`,
    publishedIds,
    errors,
  })
}
