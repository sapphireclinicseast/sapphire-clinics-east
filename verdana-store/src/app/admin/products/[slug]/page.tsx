"use client"

import { useState, useEffect, useCallback, use } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Upload,
  X,
  ImagePlus,
  Check,
  Loader2,
  ExternalLink,
  Trash2,
  Save,
  Plus,
} from "lucide-react"
import { formatPrice } from "@/lib/format"
import { Button } from "@/components/ui/button"
import type { Product, Collection, ProductVariant } from "@/lib/types"

interface AdminProductPageProps {
  params: Promise<{ slug: string }>
}

interface ProductWithImages extends Product {
  uploadedImages: string[]
}

export default function AdminProductPage({ params }: AdminProductPageProps) {
  const { slug } = use(params)
  const router = useRouter()

  const [product, setProduct] = useState<ProductWithImages | null>(null)
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)

  // Editable fields
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [collectionSlug, setCollectionSlug] = useState("")
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [images, setImages] = useState<string[]>([])

  const [uploading, setUploading] = useState(false)
  const [savingDetails, setSavingDetails] = useState(false)
  const [savingImages, setSavingImages] = useState(false)
  const [detailsSaved, setDetailsSaved] = useState(false)
  const [imagesSaved, setImagesSaved] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  // Load product data
  useEffect(() => {
    fetch("/api/admin/products")
      .then((r) => r.json())
      .then((d) => {
        const p = d.products.find((pr: ProductWithImages) => pr.slug === slug)
        if (p) {
          setProduct(p)
          setTitle(p.title)
          setDescription(p.description)
          setPrice(String(p.price))
          setCollectionSlug(p.collectionSlug)
          setVariants(p.variants || [])
          setImages(p.uploadedImages || [])
        }
        setCollections(d.collections || [])
        setLoading(false)
      })
  }, [slug])

  // ── Image upload ──────────────────────────────────────────────

  const uploadFile = useCallback(
    async (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("productSlug", slug)
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData })
      const data = await res.json()
      return data.url as string
    },
    [slug]
  )

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true)
      const fileArray = Array.from(files).filter((f) => f.type.startsWith("image/"))
      const uploadedUrls: string[] = []
      for (const file of fileArray) {
        try {
          const url = await uploadFile(file)
          uploadedUrls.push(url)
        } catch (err) {
          console.error("Failed to upload:", file.name, err)
        }
      }
      setImages((prev) => [...prev, ...uploadedUrls])
      setUploading(false)
      setImagesSaved(false)
    },
    [uploadFile]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
    },
    [handleFiles]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files)
    },
    [handleFiles]
  )

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
    setImagesSaved(false)
  }

  const moveImage = (from: number, to: number) => {
    setImages((prev) => {
      const arr = [...prev]
      const [removed] = arr.splice(from, 1)
      arr.splice(to, 0, removed)
      return arr
    })
    setImagesSaved(false)
  }

  // ── Save functions ────────────────────────────────────────────

  async function saveDetails() {
    setSavingDetails(true)
    try {
      await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          title,
          description,
          price: Number(price),
          collectionSlug,
          variants,
        }),
      })
      setDetailsSaved(true)
      setTimeout(() => setDetailsSaved(false), 2000)
    } catch (err) {
      console.error("Failed to save details:", err)
    }
    setSavingDetails(false)
  }

  async function saveImages() {
    setSavingImages(true)
    try {
      await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, images }),
      })
      setImagesSaved(true)
      setTimeout(() => setImagesSaved(false), 2000)
    } catch (err) {
      console.error("Failed to save images:", err)
    }
    setSavingImages(false)
  }

  async function handleDeleteProduct() {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    const res = await fetch(`/api/admin/products?slug=${slug}`, { method: "DELETE" })
    if (res.ok) router.push("/admin")
  }

  // ── Variant management ────────────────────────────────────────

  function addVariant() {
    setVariants((prev) => [...prev, { label: "", colorHex: "#1E88E5" }])
    setDetailsSaved(false)
  }

  function updateVariant(index: number, field: keyof ProductVariant, value: string) {
    setVariants((prev) => {
      const arr = [...prev]
      arr[index] = { ...arr[index], [field]: value }
      return arr
    })
    setDetailsSaved(false)
  }

  function removeVariant(index: number) {
    setVariants((prev) => prev.filter((_, i) => i !== index))
    setDetailsSaved(false)
  }

  // ── Render ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-verdana-teal" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Product not found</p>
        <Link href="/admin" className="text-verdana-teal hover:underline mt-2 inline-block">
          Back to products
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link
            href="/admin"
            className="mt-1 rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-verdana-charcoal">{product.title}</h1>
            <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
              <span>{formatPrice(product.price)}</span>
              <span className="text-gray-300">|</span>
              <span>{collections.find((c) => c.slug === product.collectionSlug)?.name}</span>
              <span className="text-gray-300">|</span>
              <Link
                href={`/products/${slug}`}
                className="inline-flex items-center gap-1 text-verdana-teal hover:underline"
              >
                View in store <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
        <button
          onClick={handleDeleteProduct}
          className="rounded-lg border border-red-200 p-2 text-red-400 hover:bg-red-50 hover:text-red-600 transition-all"
          title="Delete product"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ── Left column: Product Details ───────────────────── */}
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-verdana-charcoal">Product Details</h2>
              <Button onClick={saveDetails} disabled={savingDetails} size="sm">
                {savingDetails ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                ) : detailsSaved ? (
                  <><Check className="h-4 w-4" /> Saved</>
                ) : (
                  <><Save className="h-4 w-4" /> Save Details</>
                )}
              </Button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setDetailsSaved(false) }}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => { setDescription(e.target.value); setDetailsSaved(false) }}
                rows={5}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Price (PHP)</label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => { setPrice(e.target.value); setDetailsSaved(false) }}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                <select
                  value={collectionSlug}
                  onChange={(e) => { setCollectionSlug(e.target.value); setDetailsSaved(false) }}
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
                  Color Variants ({variants.length})
                </label>
                <button
                  onClick={addVariant}
                  className="inline-flex items-center gap-1 text-xs text-verdana-teal hover:underline"
                >
                  <Plus className="h-3 w-3" /> Add variant
                </button>
              </div>
              {variants.length === 0 ? (
                <p className="text-xs text-gray-400">No variants. Click &quot;Add variant&quot; to add color options.</p>
              ) : (
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
                        placeholder="Color name"
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal"
                      />
                      <button
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
          </div>
        </div>

        {/* ── Right column: Photos ──────────────────────────── */}
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-verdana-charcoal">
                Photos ({images.length})
              </h2>
              <Button onClick={saveImages} disabled={savingImages} size="sm">
                {savingImages ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                ) : imagesSaved ? (
                  <><Check className="h-4 w-4" /> Saved</>
                ) : (
                  <><Save className="h-4 w-4" /> Save Photos</>
                )}
              </Button>
            </div>

            {/* Upload area */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`relative rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                dragOver
                  ? "border-verdana-teal bg-verdana-teal/5"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileInput}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              <div className="flex flex-col items-center gap-2">
                {uploading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-verdana-teal" />
                ) : (
                  <div className="rounded-full bg-verdana-teal/10 p-2.5">
                    <Upload className="h-5 w-5 text-verdana-teal" />
                  </div>
                )}
                <p className="text-sm font-medium text-verdana-charcoal">
                  {uploading ? "Uploading..." : "Drop images or click to upload"}
                </p>
                <p className="text-xs text-gray-400">PNG, JPG, WebP up to 10MB</p>
              </div>
            </div>

            {/* Image grid */}
            {images.length > 0 ? (
              <div>
                <p className="text-xs text-gray-400 mb-3">
                  First image is the main product photo. Use arrows to reorder.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {images.map((url, index) => (
                    <div
                      key={url}
                      className="group relative aspect-square overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
                    >
                      <Image src={url} alt={`Photo ${index + 1}`} fill unoptimized={url.startsWith("/api/uploads")} className="object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all">
                        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {index > 0 && (
                            <button
                              onClick={() => moveImage(index, index - 1)}
                              className="rounded-md bg-white/90 px-1.5 py-1 text-xs font-medium text-gray-700 hover:bg-white shadow-sm"
                            >
                              ←
                            </button>
                          )}
                          {index < images.length - 1 && (
                            <button
                              onClick={() => moveImage(index, index + 1)}
                              className="rounded-md bg-white/90 px-1.5 py-1 text-xs font-medium text-gray-700 hover:bg-white shadow-sm"
                            >
                              →
                            </button>
                          )}
                          <button
                            onClick={() => removeImage(index)}
                            className="rounded-md bg-red-500/90 px-1.5 py-1 text-white hover:bg-red-600 shadow-sm"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        {index === 0 && (
                          <div className="absolute bottom-1.5 left-1.5 rounded-md bg-verdana-teal px-2 py-0.5 text-xs font-medium text-white">
                            Main
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Add more */}
                  <label className="relative flex aspect-square cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-verdana-teal hover:bg-verdana-teal/5 transition-all">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileInput}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                    <div className="text-center text-gray-400">
                      <ImagePlus className="mx-auto h-5 w-5" />
                      <span className="mt-1 block text-xs">Add</span>
                    </div>
                  </label>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center">
                <ImagePlus className="mx-auto h-10 w-10 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">No photos uploaded yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
