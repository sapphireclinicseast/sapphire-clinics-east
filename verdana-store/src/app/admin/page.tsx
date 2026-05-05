"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { ImagePlus, Package, Search, Trash2 } from "lucide-react"
import { formatPrice } from "@/lib/format"
import type { Product, Collection } from "@/lib/types"

interface ProductWithImages extends Product {
  uploadedImages: string[]
}

export default function AdminPage() {
  const [products, setProducts] = useState<ProductWithImages[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCollection, setSelectedCollection] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    fetch("/api/admin/products")
      .then((r) => r.json())
      .then((d) => {
        setProducts(d.products)
        setCollections(d.collections || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filteredProducts = products.filter((p) => {
    const matchesCollection = selectedCollection === "all" || p.collectionSlug === selectedCollection
    const matchesSearch = !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCollection && matchesSearch
  })

  async function handleDelete(slug: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    const res = await fetch(`/api/admin/products?slug=${slug}`, { method: "DELETE" })
    if (res.ok) {
      setProducts((prev) => prev.filter((p) => p.slug !== slug))
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-verdana-charcoal">Product Management</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-verdana-charcoal">Product Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            {products.length} products across {collections.length} categories
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-verdana-teal/10 px-3 py-2 text-sm text-verdana-teal">
            <Package className="h-4 w-4" />
            {products.filter((p) => p.uploadedImages.length > 0).length} with photos
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all"
          />
        </div>

        {/* Category filter */}
        <select
          value={selectedCollection}
          onChange={(e) => setSelectedCollection(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all"
        >
          <option value="all">All Categories ({products.length})</option>
          {collections.map((c) => {
            const count = products.filter((p) => p.collectionSlug === c.slug).length
            return (
              <option key={c.slug} value={c.slug}>
                {c.name} ({count})
              </option>
            )
          })}
        </select>
      </div>

      {/* Product grid */}
      {filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-gray-500">No products found</p>
          <Link
            href="/admin/products/new"
            className="mt-3 inline-block text-sm text-verdana-teal hover:underline"
          >
            Add your first product
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="group relative rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-verdana-teal/30 hover:shadow-md"
            >
              <Link href={`/admin/products/${product.slug}`} className="block p-4">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
                  {product.uploadedImages.length > 0 ? (
                    <Image
                      src={product.uploadedImages[0]}
                      alt={product.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center text-gray-400">
                        <ImagePlus className="mx-auto h-8 w-8 mb-2" />
                        <span className="text-xs">No photos</span>
                      </div>
                    </div>
                  )}
                  {/* Photo count badge */}
                  <div className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                    {product.uploadedImages.length} photo{product.uploadedImages.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="mt-3">
                  <h3 className="font-medium text-verdana-charcoal group-hover:text-verdana-teal transition-colors line-clamp-1">
                    {product.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-400 line-clamp-1">{product.description}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-verdana-charcoal">{formatPrice(product.price)}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                      {collections.find((c) => c.slug === product.collectionSlug)?.name || product.collectionSlug}
                    </span>
                  </div>
                  {product.variants.length > 0 && (
                    <div className="mt-2 flex gap-1">
                      {product.variants.slice(0, 6).map((v) => (
                        <div
                          key={v.label}
                          className="h-3 w-3 rounded-full border border-gray-300"
                          style={{ backgroundColor: v.colorHex || "#ccc" }}
                          title={v.label}
                        />
                      ))}
                      {product.variants.length > 6 && (
                        <span className="text-xs text-gray-400">+{product.variants.length - 6}</span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
              {/* Delete button */}
              <button
                onClick={() => handleDelete(product.slug, product.title)}
                className="absolute top-6 right-6 rounded-lg bg-white/90 p-1.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all shadow-sm"
                title="Delete product"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
