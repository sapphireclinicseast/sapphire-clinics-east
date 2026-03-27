import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { collections, products } from '../src/lib/products'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://sapphire:sapphire@localhost:5433/sapphire_accounting'

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  console.log('Seeding store collections...')

  // ── Upsert collections ──────────────────────────────────────
  for (const col of collections) {
    await prisma.storeCollection.upsert({
      where: { slug: col.slug },
      update: {
        name: col.name,
        description: col.description,
        imageUrl: col.imageUrl,
      },
      create: {
        id: col.id,
        name: col.name,
        slug: col.slug,
        description: col.description,
        imageUrl: col.imageUrl,
      },
    })
    console.log(`  Collection: ${col.name}`)
  }

  console.log('Seeding store products...')

  // ── Upsert products ─────────────────────────────────────────
  for (const prod of products) {
    // Resolve collection id from slug
    const collection = await prisma.storeCollection.findUnique({
      where: { slug: prod.collectionSlug },
    })

    const upserted = await prisma.storeProduct.upsert({
      where: { slug: prod.slug },
      update: {
        title: prod.title,
        description: prod.description,
        price: prod.price,
        collectionId: collection?.id ?? null,
      },
      create: {
        id: prod.id,
        slug: prod.slug,
        title: prod.title,
        description: prod.description,
        price: prod.price,
        collectionId: collection?.id ?? null,
      },
    })

    // ── Variants ──────────────────────────────────────────────
    // Delete existing variants and re-create to stay in sync
    await prisma.storeProductVariant.deleteMany({
      where: { productId: upserted.id },
    })

    for (const v of prod.variants) {
      await prisma.storeProductVariant.create({
        data: {
          productId: upserted.id,
          variantType: 'Color',
          variantLabel: v.label,
          colorHex: v.colorHex,
        },
      })
    }

    // ── Images ────────────────────────────────────────────────
    await prisma.storeProductImage.deleteMany({
      where: { productId: upserted.id },
    })

    for (let i = 0; i < prod.images.length; i++) {
      await prisma.storeProductImage.create({
        data: {
          productId: upserted.id,
          url: prod.images[i],
          altText: prod.title,
          sortOrder: i,
        },
      })
    }

    const variantInfo =
      prod.variants.length > 0 ? ` (${prod.variants.length} variants)` : ''
    console.log(`  Product: ${prod.title}${variantInfo}`)
  }

  console.log(`\nDone! Seeded ${collections.length} collections and ${products.length} products.`)

  await prisma.$disconnect()
  await pool.end()
}

main().catch((e) => {
  console.error('Seed failed:', e)
  process.exit(1)
})
