import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params
  const filePath = path.join(UPLOAD_DIR, ...segments)

  // Prevent path traversal
  const resolved = path.resolve(filePath)
  const uploadRoot = path.resolve(UPLOAD_DIR)
  if (!resolved.startsWith(uploadRoot)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!existsSync(resolved)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const ext = path.extname(resolved).slice(1).toLowerCase()
  const contentType = MIME_MAP[ext] ?? 'application/octet-stream'

  const buffer = await readFile(resolved)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': contentType === 'application/pdf' ? 'inline' : 'inline',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
