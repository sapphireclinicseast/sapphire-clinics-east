import { Queue, Worker, Job } from 'bullmq'
import { prisma } from './prisma'
import { postToFacebook, postToInstagram, postVideoToFacebook, postVideoToInstagram } from './meta'
import { executeSendCampaign } from './email'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

function getRedisConnection() {
  try {
    const url = new URL(redisUrl)
    return {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password || undefined,
    }
  } catch {
    return { host: 'localhost', port: 6379 }
  }
}

const connection = getRedisConnection()

export const postQueue = new Queue('scheduled-posts', { connection })
export const emailQueue = new Queue('scheduled-emails', { connection })

export interface PostJobData {
  postId: string
}

export interface EmailJobData {
  campaignId: string
}

export async function schedulePost(postId: string, scheduledAt: Date) {
  // Allow past times — publish immediately (delay = 0)
  const delay = Math.max(0, scheduledAt.getTime() - Date.now())
  await postQueue.add('publish-post', { postId }, { delay, jobId: postId })
}

export async function scheduleEmail(campaignId: string, scheduledAt: Date) {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now())
  await emailQueue.add('send-email', { campaignId }, { delay, jobId: campaignId })
}

export async function cancelScheduledEmail(campaignId: string) {
  const job = await emailQueue.getJob(campaignId)
  if (job) await job.remove()
}

export async function cancelScheduledPost(postId: string) {
  const job = await postQueue.getJob(postId)
  if (job) await job.remove()
}

// ─── Re-queue any SCHEDULED posts that missed their scheduled time ─────────────
export async function recoverStuckPosts() {
  try {
    const stuck = await prisma.scheduledPost.findMany({
      where: { status: 'SCHEDULED' },
    })

    if (!stuck.length) {
      console.log('✓ No stuck scheduled posts to recover')
      return
    }

    console.log(`⚠ Found ${stuck.length} stuck SCHEDULED post(s) — re-queuing…`)

    for (const post of stuck) {
      try {
        // Remove any stale job first (won't error if not found)
        const existing = await postQueue.getJob(post.id)
        if (existing) await existing.remove()

        const delay = Math.max(0, post.scheduledAt.getTime() - Date.now())
        await postQueue.add('publish-post', { postId: post.id }, { delay, jobId: post.id })
        console.log(`  ↻ Re-queued post ${post.id} (delay: ${delay}ms)`)
      } catch (err) {
        console.error(`  ✗ Failed to re-queue post ${post.id}:`, err)
      }
    }
  } catch (err) {
    console.error('recoverStuckPosts error:', err)
  }
}

export function startWorker() {
  const worker = new Worker<PostJobData>(
    'scheduled-posts',
    async (job: Job<PostJobData>) => {
      const post = await prisma.scheduledPost.findUnique({
        where: { id: job.data.postId },
      })

      if (!post || post.status !== 'SCHEDULED') return

      const errors: string[] = []
      const publishedIds: string[] = []

      // Load only the accounts the user selected for this post.
      // If accountIds is empty (legacy posts), fall back to filtering by platform.
      const socialAccounts = await prisma.socialAccount.findMany({
        where: post.accountIds.length > 0
          ? { id: { in: post.accountIds } }
          : post.platforms.length > 0
            ? { platform: { in: post.platforms as any } }
            : undefined,
      })

      const isVideo = post.mediaType === 'video'

      for (const acct of socialAccounts) {
        try {
          if (acct.platform === 'FACEBOOK') {
            if (isVideo && post.imageUrl) {
              const result = await postVideoToFacebook({
                description: post.content,
                videoUrl: post.imageUrl,
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
                imageUrl: post.imageUrl ?? undefined,
                account: {
                  accessToken: acct.accessToken,
                  pageId: acct.pageId ?? acct.accountId,
                  pageName: acct.pageName ?? undefined,
                },
              })
              publishedIds.push(`FB:${acct.pageName}:${result.id}`)
            }
          } else if (acct.platform === 'INSTAGRAM') {
            if (!post.imageUrl) {
              errors.push(`Instagram (${acct.pageName}): Media is required for Instagram posts`)
            } else if (isVideo) {
              const result = await postVideoToInstagram({
                caption: post.content,
                videoUrl: post.imageUrl,
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
                imageUrl: post.imageUrl,
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
          errors.push(`${acct.platform} (${acct.pageName}): ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      }

      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: {
          status: errors.length > 0 && publishedIds.length === 0 ? 'FAILED' : 'PUBLISHED',
          errorMsg: errors.length > 0 ? errors.join('; ') : null,
          publishedId: publishedIds.join(', '),
        },
      })
    },
    { connection }
  )

  worker.on('failed', async (job, err) => {
    if (job) {
      await prisma.scheduledPost.update({
        where: { id: job.data.postId },
        data: { status: 'FAILED', errorMsg: err.message },
      })
    }
  })

  console.log('✓ BullMQ post worker started')

  // ─── Email worker ────────────────────────────────────────────────────────
  const emailWorker = new Worker<EmailJobData>(
    'scheduled-emails',
    async (job: Job<EmailJobData>) => {
      console.log(`Sending scheduled email campaign ${job.data.campaignId}`)
      await executeSendCampaign(job.data.campaignId)
    },
    { connection }
  )

  emailWorker.on('failed', async (job, err) => {
    if (job) {
      console.error(`Email campaign ${job.data.campaignId} failed:`, err.message)
      await prisma.emailCampaign.update({
        where: { id: job.data.campaignId },
        data: { status: 'failed' },
      }).catch(() => null)
    }
  })

  console.log('✓ BullMQ email worker started')
  return worker
}
