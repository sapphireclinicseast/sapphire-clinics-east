import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const productSlug = formData.get('productSlug') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!productSlug) {
      return NextResponse.json({ error: 'No product slug provided' }, { status: 400 })
    }

    const type = formData.get('type') as string | null // 'collection' or default 'product'

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'jpg'
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    // Determine upload directory based on type
    const subDir = type === 'collection' ? 'collections' : `products/${productSlug}`
    const uploadDir = join(process.cwd(), 'public', 'uploads', ...subDir.split('/'))
    await mkdir(uploadDir, { recursive: true })

    const filepath = join(uploadDir, filename)
    await writeFile(filepath, buffer)

    const url = `/api/uploads/${subDir}/${filename}`

    return NextResponse.json({ url, filename })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
