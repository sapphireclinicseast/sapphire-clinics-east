import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
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
  ])
  const allowedExt = new Set([
    'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'pdf',
    'doc', 'docx', 'xls', 'xlsx',
    'mp3', 'm4a', 'aac', 'wav', 'weba', 'webm', 'ogg', 'oga', '3gp', 'amr', 'caf',
  ])
  const typeOk = (file.type && allowedMime.has(file.type)) || allowedExt.has(ext)
  if (!typeOk) {
    return NextResponse.json(
      { error: 'Invalid file type. Allowed: images, PDF, Word, Excel, and audio (voice notes).' },
      { status: 400 },
    )
  }

  // Validate file size. Capped at 20MB to match nginx client_max_body_size on
  // staff.sapphireclinicseast.org (bigger uploads 413 at the proxy first).
  // Still ample for voice notes and scanned docs (was 10MB).
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Max 20MB.' }, { status: 400 })
  }

  const dir = path.join(UPLOAD_DIR, 'session-notes', scheduleId)
  await mkdir(dir, { recursive: true })

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || 'bin'}`
  const filePath = path.join('session-notes', scheduleId, fileName)
  const fullPath = path.join(UPLOAD_DIR, filePath)

  const bytes = await file.arrayBuffer()
  await writeFile(fullPath, Buffer.from(bytes))

  return NextResponse.json({
    fileName: file.name,
    filePath,
    mimeType: file.type,
  })
}
