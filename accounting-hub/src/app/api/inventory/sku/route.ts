import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET next available SKU sequence for a given prefix
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const department = searchParams.get('department')
  const category = searchParams.get('category')
  const subcategory = searchParams.get('subcategory')

  if (!department || !category || !subcategory) {
    return NextResponse.json({ error: 'Department, category, and subcategory are required' }, { status: 400 })
  }

  const prefix = `${department}-${category}-${subcategory}`

  const lastItem = await prisma.inventoryItem.findFirst({
    where: { sku: { startsWith: prefix } },
    orderBy: { skuSequence: 'desc' },
    select: { skuSequence: true },
  })

  const nextSequence = (lastItem?.skuSequence || 0) + 1
  const sku = `${prefix}-${String(nextSequence).padStart(3, '0')}`

  return NextResponse.json({ sku, sequence: nextSequence })
}
