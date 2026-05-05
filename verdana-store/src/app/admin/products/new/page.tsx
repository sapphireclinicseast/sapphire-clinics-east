"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Plus, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Collection, ProductVariant } from "@/lib/types"

export default function NewProductPage() {
  const router = useRouter()
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [collectionSlug, setCollectionSlug] = useState("")
  const [variants, setVariants] = useState<ProductVariant[]>([])

  useEffect(() => {
    fetch("/api/admin/collections")
      .then((r) => r.json())
      .then((d) => {
        setCollections(d.collections || [])
        if (d.collections?.length > 0) setCollectionSlug(d.collections[0].slug)
        setLoading(false)
      })
  }, [])

  function addVariant() {
    setVariants((prev) => [...prev, { label: "", colorHex: "#1E88E5" }])
  }

  function updateVariant(index: number, field: keyof ProductVariant, value: string) {
    setVariants((prev) => {
      const arr = [...prev]
      arr[index] = { ...arr[index], [field]: value }
      return arr
    })
  }

  function removeVariant(index: number) {
    setVariants((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !collectionSlug) return

    setSaving(true)
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          price: Number(price) || 0,
          collectionSlug,
          variants: variants.filter((v) => v.label.trim()),
        }),
      })
      const data = await res.json()
      if (data.product) {
        router.push(`/admin/products/${data.product.slug}`)
      }
    } catch (err) {
      console.error("Failed to create product:", err)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-verdana-teal" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin"
          className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold text-verdana-charcoal">Add New Product</h1>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Product Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Sensory Chew Pendant"
            required
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Describe the product, its features, and who it's for..."
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Price (PHP) *</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              required
              min="0"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Category *</label>
            <select
              value={collectionSlug}
              onChange={(e) => setCollectionSlug(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all"
            >
              {collections.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Variants */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Color Variants (optional)
            </label>
            <button
              type="button"
              onClick={addVariant}
              className="inline-flex items-center gap-1 text-xs text-verdana-teal hover:underline"
            >
              <Plus className="h-3 w-3" /> Add variant
            </button>
          </div>
          {variants.length > 0 && (
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={v.colorHex}
                    onChange={(e) => updateVariant(i, "colorHex", e.target.value)}
                    className="h-9 w-9 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={v.label}
                    onChange={(e) => updateVariant(i, "label", e.target.value)}
                    placeholder="Color name (e.g., Baby Pink)"
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal"
                  />
                  <button
                    type="button"
                    onClick={() => removeVariant(i)}
                    className="rounded-lg p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            You can upload photos after creating the product.
          </p>
          <Button type="submit" disabled={saving || !title.trim()}>
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
            ) : (
              "Create Product"
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
