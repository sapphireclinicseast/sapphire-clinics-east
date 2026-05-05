// ── Server-side helpers for reading/writing store data ──────────

import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { Product, Collection, ProductVariant } from './types'

interface StoreData {
  collections: Collection[]
  products: Product[]
}

const DATA_FILE = join(process.cwd(), 'src', 'data', 'store-data.json')

export async function readStoreData(): Promise<StoreData> {
  try {
    const raw = await readFile(DATA_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return { collections: [], products: [] }
  }
}

export async function writeStoreData(data: StoreData): Promise<void> {
  await mkdir(join(process.cwd(), 'src', 'data'), { recursive: true })
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2))
}

// ── Product helpers ─────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function addProduct(input: {
  title: string
  description: string
  price: number
  collectionSlug: string
  variants: ProductVariant[]
}): Promise<Product> {
  const data = await readStoreData()
  const slug = slugify(input.title)
  const id = `prod_${slug.replace(/-/g, '_')}`

  const product: Product = {
    id,
    slug,
    title: input.title,
    description: input.description,
    price: input.price,
    collectionSlug: input.collectionSlug,
    variants: input.variants || [],
    images: [],
  }

  data.products.push(product)
  await writeStoreData(data)
  return product
}

export async function updateProduct(
  slug: string,
  updates: Partial<Pick<Product, 'title' | 'description' | 'price' | 'collectionSlug' | 'variants' | 'images'>>
): Promise<Product | null> {
  const data = await readStoreData()
  const index = data.products.findIndex((p) => p.slug === slug)
  if (index === -1) return null

  const product = data.products[index]

  if (updates.title !== undefined) product.title = updates.title
  if (updates.description !== undefined) product.description = updates.description
  if (updates.price !== undefined) product.price = updates.price
  if (updates.collectionSlug !== undefined) product.collectionSlug = updates.collectionSlug
  if (updates.variants !== undefined) product.variants = updates.variants
  if (updates.images !== undefined) product.images = updates.images

  data.products[index] = product
  await writeStoreData(data)
  return product
}

export async function deleteProduct(slug: string): Promise<boolean> {
  const data = await readStoreData()
  const before = data.products.length
  data.products = data.products.filter((p) => p.slug !== slug)
  if (data.products.length === before) return false
  await writeStoreData(data)
  return true
}

// ── Collection helpers ──────────────────────────────────────────

export async function addCollection(input: {
  name: string
  description: string
}): Promise<Collection> {
  const data = await readStoreData()
  const slug = slugify(input.name)
  const id = `col_${slug.replace(/-/g, '_')}`

  const collection: Collection = {
    id,
    slug,
    name: input.name,
    description: input.description,
    imageUrl: '',
  }

  data.collections.push(collection)
  await writeStoreData(data)
  return collection
}

export async function updateCollection(
  slug: string,
  updates: Partial<Pick<Collection, 'name' | 'description' | 'imageUrl'>>
): Promise<Collection | null> {
  const data = await readStoreData()
  const index = data.collections.findIndex((c) => c.slug === slug)
  if (index === -1) return null

  const collection = data.collections[index]
  if (updates.name !== undefined) collection.name = updates.name
  if (updates.description !== undefined) collection.description = updates.description
  if (updates.imageUrl !== undefined) collection.imageUrl = updates.imageUrl

  data.collections[index] = collection
  await writeStoreData(data)
  return collection
}

export async function deleteCollection(slug: string): Promise<boolean> {
  const data = await readStoreData()
  const before = data.collections.length
  data.collections = data.collections.filter((c) => c.slug !== slug)
  if (data.collections.length === before) return false
  await writeStoreData(data)
  return true
}
