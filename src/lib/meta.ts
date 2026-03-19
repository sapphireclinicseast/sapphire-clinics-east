// Meta Graph API integration for Facebook and Instagram
// Supports multiple pages — each SocialAccount record holds its own token

export const META_API_BASE = 'https://graph.facebook.com/v22.0'

export interface SocialAccountCredentials {
  accessToken: string
  pageId: string        // FB Page ID or IG Account ID
  pageName?: string
}

export interface PostToFacebookParams {
  message: string
  imageUrl?: string
  scheduledTime?: Date
  account: SocialAccountCredentials
}

export interface PostToInstagramParams {
  caption: string
  imageUrl: string
  account: SocialAccountCredentials
}

export interface PostVideoToFacebookParams {
  description: string
  videoUrl: string
  account: SocialAccountCredentials
}

export interface PostVideoToInstagramParams {
  caption: string
  videoUrl: string
  account: SocialAccountCredentials
}

export interface MetaInsights {
  reach: number
  impressions: number
  engagement: number
  followers: number
}

// ─── Fetch all pages a user admins ────────────────────────────────────────────
export async function fetchUserPages(userAccessToken: string): Promise<Array<{
  id: string
  name: string
  access_token: string
  instagram_business_account?: { id: string }
  category: string
}>> {
  const res = await fetch(
    `${META_API_BASE}/me/accounts?fields=id,name,access_token,category,instagram_business_account&access_token=${userAccessToken}`
  )
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Failed to fetch pages: ${JSON.stringify(err.error ?? err)}`)
  }
  const data = await res.json()
  return data.data ?? []
}

// ─── Get Instagram Business Account linked to a FB page ───────────────────────
export async function getInstagramAccountForPage(
  pageId: string,
  pageAccessToken: string
): Promise<{ id: string; name: string; username: string } | null> {
  const res = await fetch(
    `${META_API_BASE}/${pageId}?fields=instagram_business_account{id,name,username}&access_token=${pageAccessToken}`
  )
  if (!res.ok) return null
  const data = await res.json()
  return data.instagram_business_account ?? null
}

// ─── Exchange short-lived token for long-lived token (60 days) ────────────────
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID ?? '',
    client_secret: process.env.META_APP_SECRET ?? '',
    fb_exchange_token: shortLivedToken,
  })
  const res = await fetch(`${META_API_BASE}/oauth/access_token?${params}`)
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Token exchange failed: ${JSON.stringify(err.error ?? err)}`)
  }
  const data = await res.json()
  return data.access_token
}

// ─── Verify a token is valid ──────────────────────────────────────────────────
export async function verifyToken(accessToken: string): Promise<{
  valid: boolean
  expiresAt?: Date
  scopes?: string[]
}> {
  const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`
  const res = await fetch(
    `${META_API_BASE}/debug_token?input_token=${accessToken}&access_token=${appToken}`
  )
  if (!res.ok) return { valid: false }
  const data = await res.json()
  const info = data.data
  return {
    valid: info?.is_valid ?? false,
    expiresAt: info?.expires_at ? new Date(info.expires_at * 1000) : undefined,
    scopes: info?.scopes ?? [],
  }
}

// ─── Post to a specific Facebook page ────────────────────────────────────────
export async function postToFacebook({
  message,
  imageUrl,
  scheduledTime,
  account,
}: PostToFacebookParams): Promise<{ id: string }> {
  const body: Record<string, string> = {
    message,
    access_token: account.accessToken,
  }

  if (scheduledTime) {
    body.scheduled_publish_time = String(Math.floor(scheduledTime.getTime() / 1000))
    body.published = 'false'
  }

  let endpoint = `${META_API_BASE}/${account.pageId}/feed`

  if (imageUrl) {
    endpoint = `${META_API_BASE}/${account.pageId}/photos`
    body.url = imageUrl
    body.caption = message
    delete body.message
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Facebook API error (${account.pageName ?? account.pageId}): ${JSON.stringify(err.error ?? err)}`)
  }

  return res.json()
}

// ─── Download a media file server-side for binary upload ─────────────────────
async function downloadMedia(url: string): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    throw new Error(`Could not download media file: ${err instanceof Error ? err.message : String(err)} — ${url}`)
  }
  if (!res.ok) throw new Error(`Could not download media file (HTTP ${res.status}): ${url}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const mimeType = res.headers.get('content-type') ?? 'application/octet-stream'
  const filename = url.split('/').pop()?.split('?')[0] ?? 'media'
  return { buffer, mimeType, filename }
}

// ─── Create an Instagram image media container ────────────────────────────────
// Instagram requires a publicly accessible image_url. Our nginx strips Next.js
// RSC Vary headers from /api/uploads/ so Instagram's fetcher can access the file.
async function createInstagramContainer(
  imageUrl: string,
  caption: string,
  account: SocialAccountCredentials,
  isCarouselItem = false,
): Promise<string> {
  const pageName = account.pageName ?? account.pageId

  const body: Record<string, string | boolean> = {
    image_url: imageUrl,
    access_token: account.accessToken,
  }
  if (!isCarouselItem) body.caption = caption
  if (isCarouselItem) body.is_carousel_item = true

  const res = await fetch(`${META_API_BASE}/${account.pageId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Instagram container error (${pageName}): ${JSON.stringify(err.error ?? err)}`)
  }
  return (await res.json()).id as string
}

// ─── Post to a specific Instagram Business account ───────────────────────────
export async function postToInstagram({
  caption,
  imageUrl,
  account,
}: PostToInstagramParams): Promise<{ id: string }> {
  const pageName = account.pageName ?? account.pageId

  // Step 1: Create media container (with pre-flight validation + retry)
  const containerId = await createInstagramContainer(imageUrl, caption, account)

  // Step 1.5: Wait for the container to be ready before publishing.
  await waitForInstagramContainer(containerId, account.accessToken, pageName)

  // Step 2: Publish
  const publishRes = await fetch(`${META_API_BASE}/${account.pageId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: account.accessToken,
    }),
  })

  if (!publishRes.ok) {
    const err = await publishRes.json()
    throw new Error(`Instagram publish error (${pageName}): ${JSON.stringify(err.error ?? err)}`)
  }

  return publishRes.json()
}

// ─── Post video to a Facebook page (binary upload — more reliable than file_url) ─
export async function postVideoToFacebook({
  description,
  videoUrl,
  account,
}: PostVideoToFacebookParams): Promise<{ id: string }> {
  // Download the video server-side, then upload as binary to Facebook.
  // Using file_url requires Facebook's servers to fetch from our VPS which is unreliable
  // (error 6000/1363048). Binary upload is the proper approach.
  let videoRes: Response
  try {
    videoRes = await fetch(videoUrl)
  } catch (fetchErr) {
    throw new Error(
      `Facebook video API error (${account.pageName ?? account.pageId}): Could not fetch video file — ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`
    )
  }
  if (!videoRes.ok) {
    throw new Error(
      `Facebook video API error (${account.pageName ?? account.pageId}): Could not fetch video file (HTTP ${videoRes.status})`
    )
  }

  const videoBuffer = Buffer.from(await videoRes.arrayBuffer())
  const filename = (videoUrl.split('/').pop()?.split('?')[0] ?? 'video.mp4')
  const mimeType = videoRes.headers.get('content-type') ?? 'video/mp4'

  // Build multipart/form-data using the global Web API FormData (Node 18+)
  const formData = new FormData()
  formData.append('description', description)
  formData.append('access_token', account.accessToken)
  formData.append('source', new Blob([videoBuffer], { type: mimeType }), filename)

  const res = await fetch(`${META_API_BASE}/${account.pageId}/videos`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json()
    const fbErr = err.error ?? err
    // Error 6000 / subcode 1363048 = video codec/format rejected by Facebook
    if (fbErr?.code === 6000 || fbErr?.error_subcode === 1363048) {
      throw new Error(
        `Facebook video API error (${account.pageName ?? account.pageId}): Facebook rejected this video file. ` +
        `Please ensure the video uses H.264 video codec and AAC audio in an MP4 or MOV container. ` +
        `HEVC (H.265) and other formats are not supported.`
      )
    }
    throw new Error(`Facebook video API error (${account.pageName ?? account.pageId}): ${JSON.stringify(fbErr)}`)
  }

  return res.json()
}

// ─── Poll Instagram container until ready (or timeout at 2 min) ──────────────
async function waitForInstagramContainer(
  containerId: string,
  accessToken: string,
  pageName: string,
  maxWaitMs = 120_000,
  pollIntervalMs = 6_000
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs))
    try {
      const res = await fetch(
        `${META_API_BASE}/${containerId}?fields=status_code,status&access_token=${accessToken}`
      )
      if (!res.ok) continue
      const data = await res.json()
      if (data.status_code === 'FINISHED') {
        // Small grace period — Instagram marks FINISHED before it's truly ready to publish
        await new Promise((r) => setTimeout(r, 3000))
        return
      }
      if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
        throw new Error(
          `Instagram video processing failed (${pageName}): status=${data.status_code}${data.status ? ` — ${data.status}` : ''}`
        )
      }
      // IN_PROGRESS — keep polling
    } catch (err) {
      // Only re-throw if it's our intentional error, not a transient fetch error
      if (err instanceof Error && err.message.startsWith('Instagram video processing failed')) throw err
    }
  }
  throw new Error(
    `Instagram video processing timed out after 2 minutes (${pageName}). The video may be too large or in an unsupported format.`
  )
}

// ─── Post video (Reel) to Instagram Business account ─────────────────────────
// Uses resumable upload API to upload video binary directly to Facebook's servers,
// bypassing error 2207076 caused by Instagram failing to fetch from our server URL.
export async function postVideoToInstagram({
  caption,
  videoUrl,
  account,
}: PostVideoToInstagramParams): Promise<{ id: string }> {
  const pageName = account.pageName ?? account.pageId

  // Step 1: Start a resumable upload session — get container id + upload URI
  const sessionRes = await fetch(`${META_API_BASE}/${account.pageId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'REELS',
      upload_type: 'resumable',
      caption,
      access_token: account.accessToken,
    }),
  })
  if (!sessionRes.ok) {
    const err = await sessionRes.json()
    throw new Error(`Instagram video session error (${pageName}): ${JSON.stringify(err.error ?? err)}`)
  }
  const { id: containerId, uri: uploadUri } = await sessionRes.json()
  if (!uploadUri) throw new Error(`Instagram video session error (${pageName}): no upload URI returned`)

  // Step 2: Download the video from our server, then upload as binary to Facebook's CDN
  const { buffer, mimeType } = await downloadMedia(videoUrl)

  const uploadRes = await fetch(uploadUri, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${account.accessToken}`,
      offset: '0',
      file_size: String(buffer.length),
      'Content-Type': mimeType.startsWith('video/') ? mimeType : 'video/mp4',
    },
    body: buffer,
  })
  if (!uploadRes.ok) {
    const text = await uploadRes.text()
    throw new Error(`Instagram video upload error (${pageName}): ${uploadRes.status} — ${text}`)
  }

  // Step 3: Poll until Instagram finishes processing
  await waitForInstagramContainer(containerId, account.accessToken, pageName)

  // Step 4: Publish
  const publishRes = await fetch(`${META_API_BASE}/${account.pageId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: account.accessToken,
    }),
  })
  if (!publishRes.ok) {
    const err = await publishRes.json()
    throw new Error(`Instagram video publish error (${pageName}): ${JSON.stringify(err.error ?? err)}`)
  }

  return publishRes.json()
}

// ─── Post carousel (multiple images) to Facebook ─────────────────────────────
export async function postCarouselToFacebook({
  message,
  imageUrls,
  account,
}: {
  message: string
  imageUrls: string[]
  account: SocialAccountCredentials
}): Promise<{ id: string }> {
  // Step 1: Upload each image as unpublished photo, get photo IDs
  const photoIds: string[] = []
  for (const url of imageUrls) {
    const res = await fetch(`${META_API_BASE}/${account.pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, published: false, access_token: account.accessToken }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(`Facebook carousel photo upload error: ${JSON.stringify(err.error ?? err)}`)
    }
    const { id } = await res.json()
    photoIds.push(id)
  }

  // Step 2: Create feed post with attached photos
  const res = await fetch(`${META_API_BASE}/${account.pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      attached_media: photoIds.map((id) => ({ media_fbid: id })),
      access_token: account.accessToken,
    }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Facebook API error (${account.pageName ?? account.pageId}): ${JSON.stringify(err.error ?? err)}`)
  }
  return res.json()
}

// ─── Post carousel (multiple images) to Instagram ─────────────────────────────
export async function postCarouselToInstagram({
  caption,
  imageUrls,
  account,
}: {
  caption: string
  imageUrls: string[]
  account: SocialAccountCredentials
}): Promise<{ id: string }> {
  // Step 1: Create child containers (binary upload — no URL fetching by Instagram)
  const pageName = account.pageName ?? account.pageId
  const childIds: string[] = []
  for (const url of imageUrls) {
    const id = await createInstagramContainer(url, '', account, true)
    await waitForInstagramContainer(id, account.accessToken, pageName)
    childIds.push(id)
  }

  // Step 2: Create carousel container
  const carouselRes = await fetch(`${META_API_BASE}/${account.pageId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
      access_token: account.accessToken,
    }),
  })
  if (!carouselRes.ok) {
    const err = await carouselRes.json()
    throw new Error(`Instagram carousel container error (${account.pageName ?? account.pageId}): ${JSON.stringify(err.error ?? err)}`)
  }
  const { id: carouselId } = await carouselRes.json()
  await waitForInstagramContainer(carouselId, account.accessToken, account.pageName ?? account.pageId)

  // Step 3: Publish
  const publishRes = await fetch(`${META_API_BASE}/${account.pageId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: carouselId, access_token: account.accessToken }),
  })
  if (!publishRes.ok) {
    const err = await publishRes.json()
    throw new Error(`Instagram carousel publish error (${account.pageName ?? account.pageId}): ${JSON.stringify(err.error ?? err)}`)
  }
  return publishRes.json()
}

// ─── Get insights for a specific page ────────────────────────────────────────
export async function getFacebookInsights(
  since: Date,
  until: Date,
  account?: SocialAccountCredentials
): Promise<MetaInsights> {
  const pageId = account?.pageId ?? process.env.META_PAGE_ID
  const accessToken = account?.accessToken ?? process.env.META_PAGE_ACCESS_TOKEN

  if (!pageId || !accessToken) {
    return { reach: 0, impressions: 0, engagement: 0, followers: 0 }
  }

  try {
    const params = new URLSearchParams({
      metric: 'page_impressions,page_reach,page_engaged_users,page_fans',
      since: String(Math.floor(since.getTime() / 1000)),
      until: String(Math.floor(until.getTime() / 1000)),
      access_token: accessToken,
      period: 'day',
    })

    const res = await fetch(`${META_API_BASE}/${pageId}/insights?${params}`)
    if (!res.ok) return { reach: 0, impressions: 0, engagement: 0, followers: 0 }

    const data = await res.json()
    const metrics: Record<string, number> = {}

    for (const item of data.data || []) {
      const lastValue = item.values?.[item.values.length - 1]?.value ?? 0
      metrics[item.name] = lastValue
    }

    return {
      reach: metrics['page_reach'] ?? 0,
      impressions: metrics['page_impressions'] ?? 0,
      engagement: metrics['page_engaged_users'] ?? 0,
      followers: metrics['page_fans'] ?? 0,
    }
  } catch {
    return { reach: 0, impressions: 0, engagement: 0, followers: 0 }
  }
}
