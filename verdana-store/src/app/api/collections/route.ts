import { NextResponse } from 'next/server'
import { collections } from '@/lib/products'

export async function GET() {
  const active = collections.filter((c) => c.isActive !== false)
  return NextResponse.json({ collections: active })
}
