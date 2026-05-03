import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  const folder = (form.get('folder') as string) || 'general'

  if (!file) return NextResponse.json({ error: 'File required' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 413 })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const filename = `${Date.now()}-${safeName}`
  const baseUploads = path.join(process.cwd(), 'uploads')
  const uploadDir = path.join(baseUploads, folder)

  // Try to ensure the per-folder subdir exists. If we can't (e.g. the
  // /app/uploads parent is read-only for our UID), fall back to writing
  // directly into the base uploads dir so the upload still succeeds.
  let resolvedDir = uploadDir
  let resolvedUrl = `/uploads/${folder}/${filename}`
  try {
    await mkdir(uploadDir, { recursive: true })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EPERM') {
      // Fall back to a known-writable folder at the top level
      resolvedDir = baseUploads
      resolvedUrl = `/uploads/${folder}-${filename}`
    } else {
      throw err
    }
  }

  try {
    await writeFile(path.join(resolvedDir, path.basename(resolvedUrl)), buffer)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Write failed: ' + msg }, { status: 500 })
  }

  return NextResponse.json({ ok: true, url: resolvedUrl, filename: path.basename(resolvedUrl) })
}
