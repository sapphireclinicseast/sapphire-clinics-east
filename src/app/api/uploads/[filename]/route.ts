// Serves uploaded files publicly — required for Meta (Facebook/Instagram) to fetch images
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params

  // Sanitize: prevent directory traversal
  const safe = path.basename(filename)
  const filePath = path.join(process.cwd(), 'uploads', safe)

  try {
    const data = await readFile(filePath)
    const ext = safe.split('.').pop()?.toLowerCase() ?? ''
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      pdf: 'application/pdf',
      html: 'text/html',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
      webm: 'video/webm',
    }
    const contentType = mimeTypes[ext] ?? 'application/octet-stream'

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(data.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        // Override Next.js Vary header — Meta's servers don't send RSC headers
        // and the Vary header can cause them to receive unexpected responses
        'Vary': 'Accept',
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
