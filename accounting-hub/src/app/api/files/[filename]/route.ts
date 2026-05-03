import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { readFile } from 'fs/promises'
import { join, basename } from 'path'
import { existsSync } from 'fs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { filename } = await params

  // Sanitize: strip any path traversal attempts
  const safe = basename(filename)
  if (!safe || safe !== filename) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
  }

  const filePath = join(process.cwd(), 'uploads', safe)

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const buffer = await readFile(filePath)

  const ext = safe.split('.').pop()?.toLowerCase() || ''
  const contentTypeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    pdf: 'application/pdf',
  }
  const contentType = contentTypeMap[ext] || 'application/octet-stream'

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${safe}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
