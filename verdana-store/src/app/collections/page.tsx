import Link from "next/link"
import Image from "next/image"
import type { Metadata } from "next"
import { ArrowRight } from "lucide-react"
import { collections as fallbackCollections } from "@/lib/products"
import { readStoreData } from "@/lib/store-data"
import { ProductSearchBar } from "@/components/products/ProductSearchBar"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Catalog",
}

export default async function CollectionsPage() {
  // Merge admin-managed collection imageUrls (from store-data.json) into the hardcoded list
  const stored = await readStoreData()
  const overrides = new Map(stored.collections.map((c) => [c.slug, c]))

  const collections = fallbackCollections.map((c) => {
    const o = overrides.get(c.slug)
    return o ? { ...c, ...o } : c
  })

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10">
        <p className="text-verdana-orange font-semibold tracking-widest uppercase text-sm mb-3">
          Collections
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-verdana-charcoal">
          Browse Our Catalog
        </h1>
        <p className="mt-3 text-gray-600 text-lg">
          Explore our curated collections of rehabilitation products
        </p>
        <div className="mt-6">
          <ProductSearchBar />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((collection) => (
          <Link
            key={collection.id}
            href={`/collections/${collection.slug}`}
            className="group block overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100 transition-all duration-300 hover:shadow-lg hover:border-verdana-teal/20 hover:-translate-y-1"
          >
            <div className="relative aspect-square bg-gray-50 overflow-hidden">
              {collection.imageUrl ? (
                <Image
                  src={collection.imageUrl}
                  alt={collection.name}
                  fill
                  unoptimized={collection.imageUrl.startsWith("/api/uploads")}
                  className="object-contain transition-transform duration-500 ease-out group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-300">
                  <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-verdana-charcoal group-hover:text-verdana-teal transition-colors">
                  {collection.name}
                </h2>
                <ArrowRight className="h-4 w-4 text-gray-300 transition-all group-hover:text-verdana-teal group-hover:translate-x-1" />
              </div>
              <p className="mt-2 text-sm text-gray-500 line-clamp-2 leading-relaxed">
                {collection.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
