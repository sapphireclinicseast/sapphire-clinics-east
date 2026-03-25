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

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Allowed: JPEG, PNG, WebP, PDF' }, { status: 400 })
  }

  // Validate file size (10MB)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Max 10MB.' }, { status: 400 })
  }

  const dir = path.join(UPLOAD_DIR, 'session-notes', scheduleId)
  await mkdir(dir, { recursive: true })

  const ext = file.name.split('.').pop() ?? 'bin'
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
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
