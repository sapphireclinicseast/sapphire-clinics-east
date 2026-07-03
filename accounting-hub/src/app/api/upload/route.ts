import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

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
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'File must be an image (JPG, PNG, WebP), PDF, Word, or Excel document' }, { status: 400 })
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
    // Optional section-appropriate renaming: <prefix>-<NN>.<ext> (e.g. AHEA-PCV26-000077-01).
    const prefixRaw = (formData.get('prefix') as string | null)?.trim() || ''
    const seqRaw = parseInt((formData.get('seq') as string | null) || '', 10)
    let filename: string
    if (prefixRaw) {
      const prefix = prefixRaw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
      const seq = Number.isFinite(seqRaw) && seqRaw > 0 ? seqRaw : 1
      filename = `${prefix}-${String(seq).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6)}.${ext}`
    } else {
      filename = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    }
    const filepath = join(uploadsDir, filename)

    await writeFile(filepath, buffer)

    return NextResponse.json({ url: `/api/files/${filename}`, filename })
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
