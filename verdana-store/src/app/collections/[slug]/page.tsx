import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { getCollectionBySlug, getProductsByCollection } from "@/lib/products"
import { getAllProductImages } from "@/lib/product-images"
import { ProductCard } from "@/components/products/ProductCard"
import { ProductSearchBar } from "@/components/products/ProductSearchBar"

interface CollectionPageProps {
  params: Promise<{ slug: string }>
}

export const dynamic = "force-dynamic"

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params
  const collection = getCollectionBySlug(slug)
  if (!collection) notFound()

  const rawProducts = getProductsByCollection(slug)
  const imageData = getAllProductImages()

  // Merge uploaded images into product data
  const products = rawProducts.map((p) => ({
    ...p,
    images: imageData[p.slug]?.length > 0 ? imageData[p.slug] : p.images,
  }))

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <nav className="mb-8 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/" className="hover:text-verdana-teal transition-colors">Home</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/collections" className="hover:text-verdana-teal transition-colors">Shop</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-verdana-charcoal font-medium">{collection.name}</span>
      </nav>

      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-verdana-charcoal">{collection.name}</h1>
        <p className="mt-3 text-gray-600 text-lg">{collection.description}</p>
        <div className="mt-3 inline-flex items-center rounded-full bg-verdana-teal/10 px-3 py-1 text-sm font-medium text-verdana-teal">
          {products.length} {products.length === 1 ? "product" : "products"}
        </div>
        <div className="mt-6">
          <ProductSearchBar />
        </div>
      </div>

      {products.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 rounded-2xl bg-verdana-off-white">
          <p className="text-gray-400 text-lg">No products in this collection yet.</p>
          <p className="mt-2 text-sm text-gray-400">Check back soon!</p>
        </div>
      )}
    </div>
  )
}
