import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SKU_HIERARCHY } from '@/lib/sku-taxonomy'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

const norm = (s: unknown) => String(s ?? '').trim()
const normCode = (s: unknown) => norm(s).toUpperCase()

// GET                 → all SKU definitions with a live product count
// GET ?products=CODE   → the products under a given SKU code (for the popup)
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const productsFor = searchParams.get('products')

  if (productsFor) {
    const code = normCode(productsFor)
    const items = await prisma.inventoryItem.findMany({
      where: { OR: [{ sku: code }, { sku: { startsWith: `${code}-` } }] },
      select: { id: true, sku: true, name: true, branch: true, quantity: true, sellingPrice: true, imageUrl: true, isActive: true },
      orderBy: { sku: 'asc' },
    })
    return NextResponse.json(items.map(i => ({ ...i, sellingPrice: i.sellingPrice ? Number(i.sellingPrice) : 0 })))
  }

  const defs = await prisma.skuDefinition.findMany({ orderBy: { skuCode: 'asc' } })
  // Count products per code in a single pass (one query for all SKUs).
  const skuRows = await prisma.inventoryItem.findMany({ select: { sku: true } })
  const withCounts = defs.map(d => {
    const prefix = `${d.skuCode}-`
    const productCount = skuRows.filter(r => r.sku === d.skuCode || r.sku.startsWith(prefix)).length
    return { ...d, productCount }
  })
  return NextResponse.json(withCounts)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json()

  // Backfill: pre-create a definition for every distinct SKU prefix in the catalogue.
  if (body?.action === 'backfill') {
    const combos = await prisma.inventoryItem.findMany({
      distinct: ['skuDepartment', 'skuCategory', 'skuSubcategory'],
      select: { skuDepartment: true, skuCategory: true, skuSubcategory: true },
    })
    const existing = new Set((await prisma.skuDefinition.findMany({ select: { skuCode: true } })).map(d => d.skuCode))
    let created = 0
    for (const c of combos) {
      const dep = c.skuDepartment, cat = c.skuCategory, sub = c.skuSubcategory
      if (!dep || !cat || !sub) continue
      const skuCode = `${dep}-${cat}-${sub}`
      if (existing.has(skuCode)) continue
      const depNode = SKU_HIERARCHY[dep]
      const catNode = depNode?.categories?.[cat]
      await prisma.skuDefinition.create({
        data: {
          skuCode,
          department: depNode?.label || dep,
          mainCategory: catNode?.label || cat,
          subcategory: catNode?.subcategories?.[sub] || sub,
          details: null,
          createdById: session.user.id as string,
        },
      })
      existing.add(skuCode); created++
    }
    return NextResponse.json({ created })
  }

  const skuCode = normCode(body.skuCode)
  if (!skuCode) return NextResponse.json({ error: 'SKU Code is required' }, { status: 400 })
  if (!norm(body.department) || !norm(body.mainCategory) || !norm(body.subcategory)) {
    return NextResponse.json({ error: 'Department, Main Category and Subcategory are required' }, { status: 400 })
  }
  const dup = await prisma.skuDefinition.findUnique({ where: { skuCode } })
  if (dup) return NextResponse.json({ error: 'That SKU Code already exists' }, { status: 409 })

  const def = await prisma.skuDefinition.create({
    data: {
      skuCode,
      department: norm(body.department),
      mainCategory: norm(body.mainCategory),
      subcategory: norm(body.subcategory),
      details: norm(body.details) || null,
      createdById: session.user.id as string,
    },
  })
  return NextResponse.json(def, { status: 201 })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { id, skuCode, department, mainCategory, subcategory, details } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {}
  if (skuCode !== undefined) data.skuCode = normCode(skuCode)
  if (department !== undefined) data.department = norm(department)
  if (mainCategory !== undefined) data.mainCategory = norm(mainCategory)
  if (subcategory !== undefined) data.subcategory = norm(subcategory)
  if (details !== undefined) data.details = norm(details) || null
  try {
    const def = await prisma.skuDefinition.update({ where: { id }, data })
    return NextResponse.json(def)
  } catch {
    return NextResponse.json({ error: 'That SKU Code already exists' }, { status: 409 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await prisma.skuDefinition.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
