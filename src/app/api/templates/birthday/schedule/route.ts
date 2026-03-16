import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { schedulePost } from '@/lib/queue'
import { writeFile } from 'fs/promises'
import path from 'path'
import { convertVideoForSocial } from '@/lib/ffmpeg'
import { getAccountIdsForBranch } from '@/lib/branch-accounts'

// Allow up to 5 min — video conversion can take a couple of minutes for large files
export const maxDuration = 300

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const staffName = form.get('staffName') as string
  const caption = form.get('caption') as string
  const platforms = JSON.parse(form.get('platforms') as string || '["FACEBOOK","INSTAGRAM"]')
  const branch = (form.get('branch') as string | null)?.toLowerCase() ?? ''
  const scheduledAt = new Date(form.get('scheduledAt') as string)
  const photoFile = form.get('photo') as File | null
  let mediaType = (form.get('mediaType') as string | null) ?? 'image'

  const baseUrl = process.env.NEXTAUTH_URL
    ?? `${req.headers.get('x-forwarded-proto') ?? 'https'}://${req.headers.get('x-forwarded-host') ?? req.headers.get('host')}`

  let imageUrl: string | undefined
  if (photoFile) {
    const bytes = await photoFile.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const ext = photoFile.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const filename = `birthday-${Date.now()}.${ext}`
    const uploadPath = path.join(process.cwd(), 'uploads', filename)
    await writeFile(uploadPath, buffer)

    const isVideo = photoFile.type.startsWith('video/') || mediaType === 'video'

    if (isVideo) {
      mediaType = 'video'
      try {
        // Convert to H.264/AAC MP4 for Facebook/Instagram compatibility
        const convertedPath = await convertVideoForSocial(uploadPath)
        const convertedFilename = path.basename(convertedPath)
        imageUrl = `${baseUrl}/api/uploads/${convertedFilename}`
      } catch (convErr) {
        console.error('Birthday video conversion failed:', convErr)
        // Fall back to original file — will post as-is (may fail on FB if H.265)
        imageUrl = `${baseUrl}/api/uploads/${filename}`
      }
    } else {
      imageUrl = `${baseUrl}/api/uploads/${filename}`
    }
  } else {
    // Support Canva-imported image URL passed directly
    const passedImageUrl = form.get('imageUrl') as string | null
    if (passedImageUrl) imageUrl = passedImageUrl
  }

  // Resolve which accounts to post to based on the selected branch
  const accountIds = await getAccountIdsForBranch(branch, platforms)

  const content = `🎂 Happy Birthday, ${staffName}! 🎂\n\n${caption}`

  const post = await prisma.scheduledPost.create({
    data: {
      content,
      caption,
      imageUrl,
      mediaType,
      platforms: platforms as any,
      accountIds,
      scheduledAt,
      status: 'SCHEDULED',
      userId: (session.user as { id: string }).id,
    },
  })

  await schedulePost(post.id, scheduledAt).catch(console.error)

  return NextResponse.json({ post })
}
