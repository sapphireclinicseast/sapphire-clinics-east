"use client"

import { useState, useMemo } from "react"
import { Search } from "lucide-react"
import type { Product } from "@/lib/types"
import { ProductCard } from "@/components/products/ProductCard"

interface SearchClientProps {
  products: Product[]
}

export function SearchClient({ products }: SearchClientProps) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    if (!query.trim()) return products
    const q = query.toLowerCase()
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    )
  }, [query, products])

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10">
        <p className="text-verdana-orange font-semibold tracking-widest uppercase text-sm mb-3">
          Search
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-verdana-charcoal">Find Products</h1>
      </div>

      {/* Search input */}
      <div className="relative max-w-lg">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products..."
          className="w-full rounded-xl border border-gray-200 bg-white pl-12 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all"
          autoFocus
        />
      </div>

      {/* Results */}
      <div className="mt-8">
        {filtered.length > 0 ? (
          <>
            <p className="text-sm text-gray-500 mb-4">
              {filtered.length} {filtered.length === 1 ? "product" : "products"} found
              {query.trim() && ` for "${query}"`}
            </p>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        ) : (
          <div className="py-16 text-center rounded-2xl bg-verdana-off-white mt-6">
            <p className="text-gray-500">No products found for &ldquo;{query}&rdquo;</p>
            <p className="mt-2 text-sm text-gray-400">Try a different search term.</p>
          </div>
        )}
      </div>
    </div>
  )
}
