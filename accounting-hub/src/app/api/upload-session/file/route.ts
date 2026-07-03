import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

// POST formData { token, file } — phone-side upload into a session.
// Authorized by the (random, short-lived) token only — the phone has no login.
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const token = (form.get('token') as string | null)?.trim() || ''
    const file = form.get('file') as File | null
    if (!token || !file) return NextResponse.json({ error: 'token and file are required' }, { status: 400 })

    const sess = await prisma.uploadSession.findUnique({ where: { id: token } })
    if (!sess) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
    if (sess.expiresAt < new Date()) return NextResponse.json({ error: 'This upload link has expired' }, { status: 410 })

    if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Only images or PDF are allowed' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })

    const uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads')
    await mkdir(uploadsDir, { recursive: true })

    const existing = Array.isArray(sess.urls) ? (sess.urls as string[]) : []
    const seq = existing.length + 1
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const prefix = sess.prefix.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
    const filename = `${prefix}-${String(seq).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6)}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(join(uploadsDir, filename), buffer)
    const url = `/api/files/${filename}`

    await prisma.uploadSession.update({ where: { id: token }, data: { urls: [...existing, url] } })
    return NextResponse.json({ url, count: existing.length + 1 })
  } catch (e) {
    console.error('Session file upload error:', e)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
