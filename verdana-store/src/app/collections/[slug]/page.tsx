import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { getCollectionBySlug, getProductsByCollection, collections } from "@/lib/products"
import { ProductCard } from "@/components/products/ProductCard"

interface CollectionPageProps {
  params: Promise<{ slug: string }>
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params
  const collection = getCollectionBySlug(slug)
  if (!collection) notFound()

  const products = getProductsByCollection(slug)

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-verdana-charcoal">{collection.name}</h1>
        <p className="mt-2 text-gray-600">{collection.description}</p>
        <p className="mt-1 text-sm text-gray-500">
          {products.length} {products.length === 1 ? "product" : "products"}
        </p>
      </div>

      {products.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-center py-12">No products in this collection yet.</p>
      )}
    </div>
  )
}
