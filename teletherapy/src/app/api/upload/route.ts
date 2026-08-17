import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { mkdir } from 'fs/promises'
import { createWriteStream } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const scheduleId = formData.get('scheduleId') as string

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Validate file type. Session attachments now include voice notes (audio),
  // photos, and documents (Word/Excel/PDF). file.type is unreliable/empty for
  // some formats (heic, m4a) depending on OS/browser, so we accept by MIME OR
  // by extension.
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const allowedMime = new Set([
    // images
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
    // documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // audio (voice notes) — common phone/browser recording formats
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
    'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/3gpp', 'audio/3gpp2', 'audio/amr',
    // video (recorded in-portal or uploaded)
    'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp', 'video/x-matroska',
    'video/x-msvideo', 'video/mpeg', 'video/x-m4v',
  ])
  const allowedExt = new Set([
    'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'pdf',
    'doc', 'docx', 'xls', 'xlsx',
    'mp3', 'm4a', 'aac', 'wav', 'weba', 'webm', 'ogg', 'oga', '3gp', 'amr', 'caf',
    'mp4', 'mov', 'mkv', 'avi', 'm4v', 'mpeg', 'mpg',
  ])
  const typeOk = (file.type && allowedMime.has(file.type)) || allowedExt.has(ext)
  if (!typeOk) {
    return NextResponse.json(
      { error: 'Invalid file type. Allowed: images, PDF, Word, Excel, audio (voice notes) and video.' },
      { status: 400 },
    )
  }

  // Validate file size. Capped at 100MB to match nginx client_max_body_size on
  // staff.sapphireclinicseast.org (bigger uploads 413 at the proxy first).
  // Generous for recorded/uploaded video; small files are unaffected.
  if (file.size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Max 100MB.' }, { status: 400 })
  }

  const dir = path.join(UPLOAD_DIR, 'session-notes', scheduleId)
  await mkdir(dir, { recursive: true })

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || 'bin'}`
  const filePath = path.join('session-notes', scheduleId, fileName)
  const fullPath = path.join(UPLOAD_DIR, filePath)

  // Stream the upload straight to disk instead of buffering the whole file via
  // arrayBuffer() — important for larger video files (avoids a second in-memory
  // copy on a memory-constrained host).
  await pipeline(Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(fullPath))

  return NextResponse.json({
    fileName: file.name,
    filePath,
    mimeType: file.type,
  })
}
