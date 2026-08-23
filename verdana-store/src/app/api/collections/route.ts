import { NextResponse } from 'next/server'
import { getAllCollections } from '@/lib/products'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ collections: getAllCollections() })
}
