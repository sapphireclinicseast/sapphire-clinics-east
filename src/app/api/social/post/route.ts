import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { schedulePost } from '@/lib/queue'
import { writeFile } from 'fs/promises'
import path from 'path'
import { convertVideoForSocial } from '@/lib/ffmpeg'
import { getAccountIdsForBranch } from '@/lib/branch-accounts'

// Allow up to 5 min — video conversion may take a few minutes for large files
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contentType = req.headers.get('content-type') || ''

  let content: string
  let caption: string | undefined
  let platforms: string[]
  let accountIds: string[]
  let branch: string | undefined
  let scheduledAt: string | undefined
  let status: string
  let imageUrl: string | undefined
  let mediaType: string | undefined

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    content = form.get('content') as string
    caption = form.get('caption') as string || undefined
    platforms = JSON.parse(form.get('platforms') as string || '[]')
    accountIds = JSON.parse(form.get('accountIds') as string || '[]')
    branch = form.get('branch') as string | undefined
    scheduledAt = form.get('scheduledAt') as string || undefined
    status = form.get('status') as string || 'DRAFT'
    mediaType = form.get('mediaType') as string || undefined

    const imageFile = form.get('image') as File | null
    if (imageFile) {
      const bytes = await imageFile.arrayBuffer()
      const buffer = Buffer.from(bytes)
      const filename = `${Date.now()}-${imageFile.name.replace(/\s/g, '-')}`
      const uploadPath = path.join(process.cwd(), 'uploads', filename)
      await writeFile(uploadPath, buffer)

      // Auto-detect mediaType from file if not provided
      if (!mediaType) mediaType = imageFile.type.startsWith('video/') ? 'video' : 'image'

      // Absolute URL required — Meta's servers must be able to fetch this publicly
      const baseUrl = process.env.NEXTAUTH_URL
        ?? `${req.headers.get('x-forwarded-proto') ?? 'https'}://${req.headers.get('x-forwarded-host') ?? req.headers.get('host')}`

      if (mediaType === 'video') {
        try {
          // Convert to H.264/AAC MP4 for Facebook/Instagram compatibility
          const convertedPath = await convertVideoForSocial(uploadPath)
          imageUrl = `${baseUrl}/api/uploads/${path.basename(convertedPath)}`
        } catch (convErr) {
          console.error('Social post video conversion failed:', convErr)
          imageUrl = `${baseUrl}/api/uploads/${filename}`
        }
      } else {
        imageUrl = `${baseUrl}/api/uploads/${filename}`
      }
    }
    // If imageUrl was passed as a form field (e.g. Canva URL), use it as-is
    const imageUrlField = form.get('imageUrl') as string | null
    if (imageUrlField && !imageUrl) imageUrl = imageUrlField
  } else {
    const body = await req.json()
    content = body.content
    caption = body.caption
    platforms = body.platforms || []
    accountIds = body.accountIds || []
    branch = body.branch
    scheduledAt = body.scheduledAt
    status = body.status || 'DRAFT'
    imageUrl = body.imageUrl
    mediaType = body.mediaType
  }

  if (!content) return NextResponse.json({ error: 'Content required' }, { status: 400 })

  // If no accountIds provided but a branch is specified (e.g. holiday posts),
  // look up the matching accounts for that branch.
  if (accountIds.length === 0 && branch) {
    accountIds = await getAccountIdsForBranch(branch, platforms)
  }

  const post = await prisma.scheduledPost.create({
    data: {
      content,
      caption,
      imageUrl,
      mediaType,
      platforms: platforms as any,
      accountIds,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
      status: status as any,
      userId: (session.user as { id: string }).id,
    },
  })

  if (status === 'SCHEDULED' && scheduledAt) {
    await schedulePost(post.id, new Date(scheduledAt)).catch((err) =>
      console.error('Queue error:', err)
    )
  }

  return NextResponse.json({ post })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const posts = await prisma.scheduledPost.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { scheduledAt: 'asc' },
    include: { createdBy: { select: { name: true, email: true } } },
  })

  return NextResponse.json({ posts })
}
