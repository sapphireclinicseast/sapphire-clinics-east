import { NextResponse } from 'next/server'
import { getAllProducts, getProductsByCollection } from '@/lib/products'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const collection = searchParams.get('collection')
  const search = searchParams.get('search')

  let products = collection
    ? getProductsByCollection(collection)
    : getAllProducts()

  if (search) {
    const q = search.toLowerCase()
    products = products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false)
    )
  }

  return NextResponse.json({ products })
}
