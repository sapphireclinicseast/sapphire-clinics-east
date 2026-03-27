"use client"

import { useState, useMemo } from "react"
import { Search } from "lucide-react"
import { getAllProducts } from "@/lib/products"
import { ProductCard } from "@/components/products/ProductCard"

export default function SearchPage() {
  const [query, setQuery] = useState("")
  const allProducts = useMemo(() => getAllProducts(), [])

  const filtered = useMemo(() => {
    if (!query.trim()) return allProducts
    const q = query.toLowerCase()
    return allProducts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    )
  }, [query, allProducts])

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-verdana-charcoal">Search</h1>

      {/* Search input */}
      <div className="relative mt-6 max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products..."
          className="w-full rounded-md border border-gray-300 pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal focus:border-transparent"
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
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        ) : (
          <div className="py-16 text-center">
            <p className="text-gray-500">No products found for &ldquo;{query}&rdquo;</p>
            <p className="mt-2 text-sm text-gray-400">Try a different search term.</p>
          </div>
        )}
      </div>
    </div>
  )
}
