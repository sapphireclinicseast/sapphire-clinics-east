import { NextResponse } from 'next/server'
import { readStoreData, addCollection, updateCollection, deleteCollection } from '@/lib/store-data'

export async function GET() {
  const data = await readStoreData()

  const collectionsWithCounts = data.collections.map((c) => ({
    ...c,
    productCount: data.products.filter((p) => p.collectionSlug === c.slug).length,
  }))

  return NextResponse.json({ collections: collectionsWithCounts })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, description } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const collection = await addCollection({
      name,
      description: description || '',
    })

    return NextResponse.json({ collection })
  } catch (error) {
    console.error('Create collection error:', error)
    return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { slug, ...updates } = body

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
    }

    const collection = await updateCollection(slug, updates)
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    return NextResponse.json({ collection })
  } catch (error) {
    console.error('Update collection error:', error)
    return NextResponse.json({ error: 'Failed to update collection' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
    }

    const deleted = await deleteCollection(slug)
    if (!deleted) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete collection error:', error)
    return NextResponse.json({ error: 'Failed to delete collection' }, { status: 500 })
  }
}
