import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'File must be an image (JPG, PNG, WebP) or PDF' }, { status: 400 })
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Save to uploads directory (volume-mounted at /app/uploads in Docker)
    const uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads')
    await mkdir(uploadsDir, { recursive: true })

    const ext = file.name.split('.').pop() || 'bin'
    const filename = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const filepath = join(uploadsDir, filename)

    await writeFile(filepath, buffer)

    return NextResponse.json({ url: `/api/files/${filename}`, filename })
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
