import Link from "next/link"
import Image from "next/image"
import type { Metadata } from "next"
import { collections } from "@/lib/products"

export const metadata: Metadata = {
  title: "Catalog",
}

export default function CollectionsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-verdana-charcoal">Catalog</h1>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((collection) => (
          <Link
            key={collection.id}
            href={`/collections/${collection.slug}`}
            className="group block overflow-hidden rounded-lg border border-gray-200 hover:border-verdana-teal transition-colors"
          >
            <div className="relative aspect-[4/3] bg-gray-100">
              {collection.imageUrl ? (
                <Image
                  src={collection.imageUrl}
                  alt={collection.name}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-400">
                  No image
                </div>
              )}
            </div>
            <div className="p-4">
              <h2 className="text-lg font-semibold text-verdana-charcoal group-hover:text-verdana-teal transition-colors">
                {collection.name}
              </h2>
              <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                {collection.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
