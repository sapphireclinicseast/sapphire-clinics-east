import { NextResponse } from 'next/server'
import { writeFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { readSettings, writeSettings } from '@/lib/settings'

// Admin-only (guarded by middleware matcher /api/admin/*). Uploads the downloadable
// products catalog; the landing page links to settings.catalog.url.

const DIR = join(process.cwd(), 'public', 'uploads', 'catalog')
const ALLOWED = ['pdf', 'jpg', 'jpeg', 'png', 'webp']
const MAX_BYTES = 50 * 1024 * 1024

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'A file is required.' }, { status: 400 })

    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (!ALLOWED.includes(ext)) return NextResponse.json({ error: 'Allowed file types: PDF, JPG, PNG, WEBP.' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File is too large (max 30MB).' }, { status: 400 })

    const token = randomBytes(6).toString('hex')
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60) || `catalog.${ext}`
    const stored = `${token}-${safe}`
    await mkdir(DIR, { recursive: true })
    await writeFile(join(DIR, stored), Buffer.from(await file.arrayBuffer()))

    const settings = await readSettings()
    const old = settings.catalog
    settings.catalog = { url: `/api/uploads/catalog/${stored}`, filename: file.name, uploadedAt: new Date().toISOString() }
    await writeSettings(settings)
    // Best-effort removal of the previous catalog file.
    if (old?.url) { try { await unlink(join(process.cwd(), 'public', old.url.replace('/api/uploads/', 'uploads/'))) } catch {} }

    return NextResponse.json({ ok: true, catalog: settings.catalog })
  } catch (e) {
    console.error('Catalog upload error:', e)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const settings = await readSettings()
    const old = settings.catalog
    delete settings.catalog
    await writeSettings(settings)
    if (old?.url) { try { await unlink(join(process.cwd(), 'public', old.url.replace('/api/uploads/', 'uploads/'))) } catch {} }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Catalog delete error:', e)
    return NextResponse.json({ error: 'Delete failed.' }, { status: 500 })
  }
}
