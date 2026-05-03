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
  let imageUrls: string[] = []
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

    // Absolute URL required — Meta's servers must be able to fetch this publicly.
    // Prefer NEXTAUTH_URL but reject localhost (dev env baked into Docker image).
    const configuredUrl = process.env.NEXTAUTH_URL
    const headersUrl = `${req.headers.get('x-forwarded-proto') ?? 'https'}://${req.headers.get('x-forwarded-host') ?? req.headers.get('host')}`
    const baseUrl = (configuredUrl && !configuredUrl.includes('localhost'))
      ? configuredUrl
      : headersUrl

    async function saveFile(file: File): Promise<string> {
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name.replace(/\s/g, '-')}`
      const uploadPath = path.join(process.cwd(), 'uploads', filename)
      await writeFile(uploadPath, buffer)
      if (!mediaType) mediaType = file.type.startsWith('video/') ? 'video' : 'image'
      if (mediaType === 'video') {
        try {
          const convertedPath = await convertVideoForSocial(uploadPath)
          return `${baseUrl}/api/uploads/${path.basename(convertedPath)}`
        } catch {
          return `${baseUrl}/api/uploads/${filename}`
        }
      }
      return `${baseUrl}/api/uploads/${filename}`
    }

    // Support multiple images: form fields 'image' (single) or 'images[]' (multiple)
    const imageFiles = form.getAll('images[]') as File[]
    const singleFile = form.get('image') as File | null

    if (imageFiles.length > 0) {
      for (const f of imageFiles) {
        if (f && f.size > 0) imageUrls.push(await saveFile(f))
      }
    } else if (singleFile && singleFile.size > 0) {
      imageUrls.push(await saveFile(singleFile))
    }

    // Canva / external URLs passed as form fields
    const imageUrlField = form.get('imageUrl') as string | null
    const imageUrlsField = form.get('imageUrls') as string | null
    if (imageUrlsField) {
      try { imageUrls = [...imageUrls, ...JSON.parse(imageUrlsField)] } catch {}
    } else if (imageUrlField && imageUrls.length === 0) {
      imageUrls = [imageUrlField]
    }

    imageUrl = imageUrls[0] ?? undefined
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
    imageUrls = body.imageUrls ?? (body.imageUrl ? [body.imageUrl] : [])
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
      imageUrls,
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

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.scheduledPost.delete({ where: { id } })
  return NextResponse.json({ success: true })
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
