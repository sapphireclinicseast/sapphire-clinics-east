import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exportDesign, getValidCanvaToken } from '@/lib/canva'
import path from 'path'
import fs from 'fs/promises'
import sharp from 'sharp'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { designId, designTitle, pageUrl } = body

  const account = await prisma.canvaAccount.findFirst()
  if (!account) {
    return NextResponse.json({ error: 'Canva not connected' }, { status: 401 })
  }

  const configuredUrl = process.env.NEXTAUTH_URL
  const headersUrl = `${req.headers.get('x-forwarded-proto') ?? 'https'}://${req.headers.get('x-forwarded-host') ?? req.headers.get('host')}`
  const baseUrl = (configuredUrl && !configuredUrl.includes('localhost')) ? configuredUrl : headersUrl

  // ── Mode B: download a specific page URL and save to uploads ──────────────
  // Called after the user picks a specific page in the picker.
  if (pageUrl) {
    try {
      const imageRes = await fetch(pageUrl as string)
      if (!imageRes.ok) throw new Error('Failed to download page from Canva')

      const arrayBuffer = await imageRes.arrayBuffer()
      const rawBuffer = Buffer.from(arrayBuffer)

      // Convert to JPEG — Instagram requires a valid JPEG/PNG.
      // Canva CDN may return WebP, AVIF, or PNG regardless of the URL extension.
      const jpegBuffer = await sharp(rawBuffer)
        .jpeg({ quality: 95 })
        .toBuffer()

      const uploadDir = path.join(process.cwd(), 'uploads')
      await fs.mkdir(uploadDir, { recursive: true })

      const safeTitle = (designTitle || 'canva-design')
        .replace(/[^a-z0-9]/gi, '-')
        .toLowerCase()
        .slice(0, 40)
      const filename = `canva-${safeTitle}-${Date.now()}.jpg`
      const filepath = path.join(uploadDir, filename)

      await fs.writeFile(filepath, jpegBuffer)

      // Absolute URL — Facebook/Instagram require publicly accessible URLs
      const imageUrl = `${baseUrl}/api/uploads/${filename}`
      return NextResponse.json({ imageUrl })
    } catch (err) {
      console.error('Canva page download error:', err)
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Download failed' },
        { status: 500 }
      )
    }
  }

  // ── Mode A: export all pages from a design ────────────────────────────────
  // Returns { pages: string[] } — Canva CDN URLs, one per page.
  // The picker uses these as thumbnails; the user then picks one page
  // which triggers a Mode B call to download that specific page.
  if (!designId) {
    return NextResponse.json({ error: 'Missing designId or pageUrl' }, { status: 400 })
  }

  try {
    const accessToken = await getValidCanvaToken()
    if (!accessToken) {
      return NextResponse.json({ error: 'Canva session expired. Please reconnect.' }, { status: 401 })
    }

    const pages = await exportDesign(accessToken, designId)
    return NextResponse.json({ pages })
  } catch (err) {
    console.error('Canva export error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed' },
      { status: 500 }
    )
  }
}
