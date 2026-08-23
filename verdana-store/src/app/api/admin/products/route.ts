import { NextResponse } from 'next/server'
import { readStoreData, addProduct, updateProduct, deleteProduct } from '@/lib/store-data'
import { getAllProductImages } from '@/lib/product-images'
import { getAllProductVideos } from '@/lib/product-videos'

export async function GET() {
  const data = await readStoreData()
  const imageData = getAllProductImages()
  const videoData = getAllProductVideos()

  const productsWithImages = data.products.map((p) => ({
    ...p,
    uploadedImages: imageData[p.slug] || [],
    uploadedVideos: videoData[p.slug] || [],
  }))

  return NextResponse.json({
    products: productsWithImages,
    collections: data.collections,
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { title, description, price, collectionSlug, variants } = body

    if (!title || !collectionSlug) {
      return NextResponse.json({ error: 'Title and collection are required' }, { status: 400 })
    }

    const product = await addProduct({
      title,
      description: description || '',
      price: Number(price) || 0,
      collectionSlug,
      variants: variants || [],
    })

    return NextResponse.json({ product })
  } catch (error) {
    console.error('Create product error:', error)
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { slug, images, videos, ...updates } = body

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
    }

    const { readFile, writeFile, mkdir } = await import('fs/promises')
    const { join } = await import('path')

    // If only images are being updated (photo save from admin)
    if (images && Object.keys(updates).length === 0 && !videos) {
      const DATA_FILE = join(process.cwd(), 'src', 'data', 'product-images.json')

      let imageData: Record<string, string[]> = {}
      try {
        const raw = await readFile(DATA_FILE, 'utf-8')
        imageData = JSON.parse(raw)
      } catch {}

      imageData[slug] = images
      await mkdir(join(process.cwd(), 'src', 'data'), { recursive: true })
      await writeFile(DATA_FILE, JSON.stringify(imageData, null, 2))

      // Also update store-data.json so product cards show images
      await updateProduct(slug, { images })

      return NextResponse.json({ success: true, images })
    }

    // If only videos are being updated
    if (videos && Object.keys(updates).length === 0 && !images) {
      const DATA_FILE = join(process.cwd(), 'src', 'data', 'product-videos.json')

      let videoData: Record<string, string[]> = {}
      try {
        const raw = await readFile(DATA_FILE, 'utf-8')
        videoData = JSON.parse(raw)
      } catch {}

      videoData[slug] = videos
      await mkdir(join(process.cwd(), 'src', 'data'), { recursive: true })
      await writeFile(DATA_FILE, JSON.stringify(videoData, null, 2))

      return NextResponse.json({ success: true, videos })
    }

    // Full product update
    const product = await updateProduct(slug, updates)
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({ product })
  } catch (error) {
    console.error('Update product error:', error)
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
    }

    const deleted = await deleteProduct(slug)
    if (!deleted) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete product error:', error)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
